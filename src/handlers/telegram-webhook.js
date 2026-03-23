import { escHtml } from "../lib/utils.js";
import { tgSend, tgEditMessage, tgAnswerCallback, tgDownloadFile } from "../lib/telegram.js";
import { sendEmail } from "../lib/email.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { getDraft, saveDraft, clearDraft } from "../lib/draft.js";

const OK = () => new Response("OK");
const HR = "─".repeat(28);

// ─── Inline keyboard helpers ──────────────────────────────────────────────────

const btn = (text, data) => ({ text, callback_data: data });
const kbd = (...rows)    => ({ inline_keyboard: rows });

const BTN_SEND   = btn("✅ Send",     "confirm");
const BTN_CANCEL = btn("❌ Cancel",   "cancel");
const BTN_RETYPE = btn("✏️ Re-type", "edit_body");
const BTN_EDIT   = btn("✏️ Edit all", "edit_all");
const BTN_SKIP   = btn("⏭️ Skip",    "skip_body");

// ─── Preview templates ────────────────────────────────────────────────────────

function replyPreview({ email, body }) {
  return [
    `📤 <b>Preview — Reply</b>`,
    ``,
    `<b>To:</b> ${escHtml(email.fromName ?? email.from)}`,
    `<b>Subject:</b> ${escHtml(`Re: ${email.subject}`)}`,
    ``,
    `<code>${HR}</code>`,
    escHtml(body),
    `<code>${HR}</code>`,
  ].join("\n");
}

function sendPreview({ to, subject, body }) {
  return [
    `📤 <b>Preview — New Email</b>`,
    ``,
    `<b>To:</b> ${escHtml(to)}`,
    `<b>Subject:</b> ${escHtml(subject)}`,
    ``,
    `<code>${HR}</code>`,
    escHtml(body),
    `<code>${HR}</code>`,
  ].join("\n");
}

function forwardPreview({ to, email }) {
  const body = [
    `---------- Forwarded message ----------`,
    `From: ${email.fromName ?? email.from}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    `To: ${email.to}`,
    ``,
    email.body ?? "",
  ].join("\n");
  return [
    `📤 <b>Preview — Forward</b>`,
    ``,
    `<b>To:</b> ${escHtml(to)}`,
    `<b>Subject:</b> ${escHtml(`Fwd: ${email.subject}`)}`,
    ``,
    `<code>${HR}</code>`,
    escHtml(body.slice(0, 600)),
    `<code>${HR}</code>`,
  ].join("\n");
}

function attachPreview({ to, subject, body, filename, mimeType }) {
  return [
    `📤 <b>Preview — Email with Attachment</b>`,
    ``,
    `<b>To:</b> ${escHtml(to)}`,
    `<b>Subject:</b> ${escHtml(subject)}`,
    body ? `\n<code>${HR}</code>\n${escHtml(body)}\n<code>${HR}</code>` : null,
    ``,
    `<b>📎 File:</b> <code>${escHtml(filename)}</code>`,
    `<b>Type:</b> ${escHtml(mimeType)}`,
  ].filter(v => v !== null).join("\n");
}

function settingsPanel(settings) {
  const fwdText = settings.autoForward ? `<code>${escHtml(settings.autoForward)}</code>` : "off";
  const buttons = settings.autoForward
    ? [btn("❌ Disable auto-forward", "settings_disable"), btn("✏️ Change address", "settings_set_addr")]
    : [btn("📧 Enable auto-forward", "settings_set_addr")];
  return {
    text: ["⚙️ <b>Settings</b>", "", `<b>Auto-forward:</b> ${fwdText}`].join("\n"),
    reply_markup: kbd(buttons),
  };
}

// ─── File info extractor ──────────────────────────────────────────────────────

function extractFileInfo(msg) {
  if (msg.document) return {
    fileId:   msg.document.file_id,
    filename: msg.document.file_name  ?? "attachment",
    mimeType: msg.document.mime_type  ?? "application/octet-stream",
  };
  if (msg.photo) return {
    fileId:   msg.photo.at(-1).file_id,
    filename: "photo.jpg",
    mimeType: "image/jpeg",
  };
  if (msg.video) return {
    fileId:   msg.video.file_id,
    filename: msg.video.file_name  ?? "video.mp4",
    mimeType: msg.video.mime_type  ?? "video/mp4",
  };
  if (msg.audio) return {
    fileId:   msg.audio.file_id,
    filename: msg.audio.file_name  ?? "audio",
    mimeType: msg.audio.mime_type  ?? "audio/mpeg",
  };
  return null;
}

// ─── Draft step handler (free-text + file input during active flows) ──────────

async function handleDraftStep(ctx, draft) {
  const { token, chatId, env, text, msg } = ctx;

  if (draft.step === "preview") {
    await tgSend(token, chatId, "⬆️ Use the buttons above to send or cancel.");
    return OK();
  }

  switch (draft.step) {

    case "reply_body":
      draft.body = text;
      draft.step = "preview";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, replyPreview(draft), {
        reply_markup: kbd([BTN_SEND, BTN_RETYPE, BTN_CANCEL]),
      });
      break;

    case "send_to":
      draft.to = text;
      draft.step = "send_subject";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 2 / 3</b> — Enter subject:`, {
        reply_markup: kbd([BTN_CANCEL]),
      });
      break;

    case "send_subject":
      draft.subject = text;
      draft.step = "send_body";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 3 / 3</b> — Enter message body:`, {
        reply_markup: kbd([BTN_CANCEL]),
      });
      break;

    case "send_body":
      draft.body = text;
      draft.step = "preview";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, sendPreview(draft), {
        reply_markup: kbd([BTN_SEND, BTN_EDIT, BTN_CANCEL]),
      });
      break;

    case "forward_to":
      draft.to = text;
      draft.step = "preview";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, forwardPreview(draft), {
        reply_markup: kbd([BTN_SEND, BTN_CANCEL]),
      });
      break;

    case "attach_to":
      draft.to = text;
      draft.step = "attach_subject";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 2 / 4</b> — Enter subject:`, {
        reply_markup: kbd([BTN_CANCEL]),
      });
      break;

    case "attach_subject":
      draft.subject = text;
      draft.step = "attach_body";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 3 / 4</b> — Enter message body (or skip):`, {
        reply_markup: kbd([BTN_SKIP, BTN_CANCEL]),
      });
      break;

    case "attach_body":
      draft.body = text;
      draft.step = "attach_file";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 4 / 4</b> — Send the file to attach:`, {
        reply_markup: kbd([BTN_CANCEL]),
      });
      break;

    case "attach_file": {
      const fileInfo = extractFileInfo(msg);
      if (!fileInfo) {
        await tgSend(token, chatId, "📎 Please send a file (document, photo, video, or audio).");
        return OK();
      }
      Object.assign(draft, fileInfo, { step: "preview" });
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, attachPreview(draft), {
        reply_markup: kbd([BTN_SEND, BTN_CANCEL]),
      });
      break;
    }

    case "settings_addr": {
      const addr = text.trim();
      await saveSettings(env, { autoForward: addr });
      await clearDraft(env, chatId);
      // Update the original settings message if we stored its ID
      if (draft.settingsMsgId) {
        const { text: t, reply_markup } = settingsPanel({ autoForward: addr });
        await tgEditMessage(token, chatId, draft.settingsMsgId, t, { reply_markup });
      }
      await tgSend(token, chatId,
        `✅ <b>Auto-forward enabled</b>\nForwarding to: <code>${escHtml(addr)}</code>`
      );
      break;
    }
  }

  return OK();
}

// ─── Callback query handler (inline button presses) ──────────────────────────

async function handleCallbackQuery(cq, env) {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const { id: queryId, data, message: cbMsg } = cq;

  await tgAnswerCallback(token, queryId);

  // ── Actions that start new flows (no existing draft needed) ──────────────

  if (data.startsWith("reply_start:")) {
    const id  = data.slice("reply_start:".length);
    const raw = await env.EMAIL_STORE.get(`email:${id}`);
    if (!raw) { await tgSend(token, chatId, `❌ Email <code>#${escHtml(id)}</code> not found.`); return; }
    const email = JSON.parse(raw);
    await clearDraft(env, chatId);
    await tgSend(token, chatId, [
      `📨 <b>Replying to #${escHtml(id)}</b>`, ``,
      `<b>From:</b> ${escHtml(email.fromName ?? email.from)}`,
      `<b>Subject:</b> ${escHtml(email.subject)}`,
      ``, `<code>${HR}</code>`,
      escHtml((email.body ?? "").slice(0, 600)),
      `<code>${HR}</code>`, ``,
      `✏️ <i>Type your reply:</i>`,
    ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
    await saveDraft(env, chatId, { type: "reply", step: "reply_body", emailId: id, email });
    return;
  }

  if (data.startsWith("fwd_start:")) {
    const id  = data.slice("fwd_start:".length);
    const raw = await env.EMAIL_STORE.get(`email:${id}`);
    if (!raw) { await tgSend(token, chatId, `❌ Email <code>#${escHtml(id)}</code> not found.`); return; }
    const email = JSON.parse(raw);
    await clearDraft(env, chatId);
    await tgSend(token, chatId, [
      `📨 <b>Forwarding #${escHtml(id)}</b>`, ``,
      `<b>From:</b> ${escHtml(email.fromName ?? email.from)}`,
      `<b>Subject:</b> ${escHtml(email.subject)}`,
      ``, `<code>${HR}</code>`,
      escHtml((email.body ?? "").slice(0, 400)),
      `<code>${HR}</code>`, ``,
      `✉️ <i>Enter the destination email address:</i>`,
    ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
    await saveDraft(env, chatId, { type: "forward", step: "forward_to", emailId: id, email });
    return;
  }

  if (data === "settings_disable") {
    await saveSettings(env, { autoForward: null });
    const { text, reply_markup } = settingsPanel({ autoForward: null });
    await tgEditMessage(token, chatId, cbMsg.message_id, text, { reply_markup });
    return;
  }

  if (data === "settings_set_addr") {
    await clearDraft(env, chatId);
    await saveDraft(env, chatId, {
      type: "settings", step: "settings_addr", settingsMsgId: cbMsg.message_id,
    });
    await tgSend(token, chatId, `📧 Enter the email address to forward to:`, {
      reply_markup: kbd([BTN_CANCEL]),
    });
    return;
  }

  if (data === "skip_body") {
    const draft = await getDraft(env, chatId);
    if (!draft) { await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>This draft has expired.</i>"); return; }
    draft.body = "";
    draft.step = "attach_file";
    await saveDraft(env, chatId, draft);
    await tgEditMessage(token, chatId, cbMsg.message_id, "⏭️ <i>Body skipped.</i>");
    await tgSend(token, chatId, `<b>Step 4 / 4</b> — Send the file to attach:`, {
      reply_markup: kbd([BTN_CANCEL]),
    });
    return;
  }

  // ── Actions that require an existing draft ─────────────────────────────────

  const draft = await getDraft(env, chatId);
  if (!draft) {
    await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>This draft has expired.</i>");
    return;
  }

  if (data === "cancel") {
    await clearDraft(env, chatId);
    await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>Draft cancelled.</i>");
    return;
  }

  if (data === "edit_body") {
    draft.step = "reply_body";
    delete draft.body;
    await saveDraft(env, chatId, draft);
    await tgEditMessage(token, chatId, cbMsg.message_id, "✏️ <i>Re-type your reply:</i>");
    return;
  }

  if (data === "edit_all") {
    await saveDraft(env, chatId, { type: "send", step: "send_to" });
    await tgEditMessage(token, chatId, cbMsg.message_id, "✏️ <i>Starting over.</i>");
    await tgSend(token, chatId,
      `📧 <b>New Email</b>\n\n<b>Step 1 / 3</b> — Enter recipient email:`,
      { reply_markup: kbd([BTN_CANCEL]) }
    );
    return;
  }

  if (data === "confirm") {
    try {
      let successText;

      if (draft.type === "reply") {
        await sendEmail(env, {
          to: draft.email.from, subject: `Re: ${draft.email.subject}`,
          body: draft.body, inReplyTo: draft.email.messageId,
        });
        successText = [
          `✅ <b>Reply sent</b>`,
          `<b>To:</b> ${escHtml(draft.email.fromName ?? draft.email.from)}`,
          `<b>Subject:</b> ${escHtml(`Re: ${draft.email.subject}`)}`,
        ].join("\n");

      } else if (draft.type === "send") {
        await sendEmail(env, { to: draft.to, subject: draft.subject, body: draft.body });
        successText = [
          `✅ <b>Email sent</b>`,
          `<b>To:</b> ${escHtml(draft.to)}`,
          `<b>Subject:</b> ${escHtml(draft.subject)}`,
        ].join("\n");

      } else if (draft.type === "forward") {
        const fwdBody = [
          `---------- Forwarded message ----------`,
          `From: ${draft.email.fromName ?? draft.email.from}`,
          `Date: ${draft.email.date}`, `Subject: ${draft.email.subject}`,
          `To: ${draft.email.to}`, ``, draft.email.body ?? "",
        ].join("\n");
        await sendEmail(env, { to: draft.to, subject: `Fwd: ${draft.email.subject}`, body: fwdBody });
        successText = [
          `✅ <b>Email forwarded</b>`,
          `<b>To:</b> ${escHtml(draft.to)}`,
          `<b>Subject:</b> ${escHtml(`Fwd: ${draft.email.subject}`)}`,
        ].join("\n");

      } else if (draft.type === "attach") {
        const buffer = await tgDownloadFile(token, draft.fileId);
        await sendEmail(env, {
          to: draft.to, subject: draft.subject,
          body: draft.body || `Please find the attached file: ${draft.filename}`,
          attachments: [{ filename: draft.filename, buffer, mimeType: draft.mimeType }],
        });
        successText = [
          `✅ <b>Email with attachment sent</b>`,
          `<b>To:</b> ${escHtml(draft.to)}`,
          `<b>Subject:</b> ${escHtml(draft.subject)}`,
          `<b>File:</b> <code>${escHtml(draft.filename)}</code>`,
        ].join("\n");
      }

      await clearDraft(env, chatId);
      await tgEditMessage(token, chatId, cbMsg.message_id, successText);

    } catch (err) {
      await tgSend(token, chatId, `❌ Failed to send: ${escHtml(err.message)}`);
    }
  }
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function startReply(ctx) {
  const { token, chatId, env, text } = ctx;
  const m  = text.match(/^\/reply(?:\s+(\w+))?/i);
  const id = m?.[1];
  if (!id) { await tgSend(token, chatId, "❌ Usage: /reply &lt;id&gt;"); return OK(); }
  const raw = await env.EMAIL_STORE.get(`email:${id}`);
  if (!raw) { await tgSend(token, chatId, `❌ No email found with ID: <code>${escHtml(id)}</code>`); return OK(); }
  const email = JSON.parse(raw);
  await tgSend(token, chatId, [
    `📨 <b>Replying to #${escHtml(id)}</b>`, ``,
    `<b>From:</b> ${escHtml(email.fromName ?? email.from)}`,
    `<b>Subject:</b> ${escHtml(email.subject)}`,
    `<b>Date:</b> ${escHtml(email.date)}`,
    ``, `<code>${HR}</code>`,
    escHtml((email.body ?? "").slice(0, 600)),
    `<code>${HR}</code>`, ``,
    `✏️ <i>Type your reply message:</i>`,
  ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
  await saveDraft(env, chatId, { type: "reply", step: "reply_body", emailId: id, email });
  return OK();
}

async function startSend(ctx) {
  const { token, chatId, env } = ctx;
  await saveDraft(env, chatId, { type: "send", step: "send_to" });
  await tgSend(token, chatId,
    `📧 <b>New Email</b>\n\n<b>Step 1 / 3</b> — Enter recipient email:`,
    { reply_markup: kbd([BTN_CANCEL]) }
  );
  return OK();
}

async function startForward(ctx) {
  const { token, chatId, env, text } = ctx;
  const m  = text.match(/^\/forward(?:\s+(\w+))?/i);
  const id = m?.[1];
  if (!id) { await tgSend(token, chatId, "❌ Usage: /forward &lt;id&gt;"); return OK(); }
  const raw = await env.EMAIL_STORE.get(`email:${id}`);
  if (!raw) { await tgSend(token, chatId, `❌ No email found with ID: <code>${escHtml(id)}</code>`); return OK(); }
  const email = JSON.parse(raw);
  await tgSend(token, chatId, [
    `📨 <b>Forwarding #${escHtml(id)}</b>`, ``,
    `<b>From:</b> ${escHtml(email.fromName ?? email.from)}`,
    `<b>Subject:</b> ${escHtml(email.subject)}`,
    `<b>Date:</b> ${escHtml(email.date)}`,
    ``, `<code>${HR}</code>`,
    escHtml((email.body ?? "").slice(0, 400)),
    `<code>${HR}</code>`, ``,
    `✉️ <i>Enter the destination email address:</i>`,
  ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
  await saveDraft(env, chatId, { type: "forward", step: "forward_to", emailId: id, email });
  return OK();
}

async function startAttach(ctx) {
  const { token, chatId, env } = ctx;
  await saveDraft(env, chatId, { type: "attach", step: "attach_to" });
  await tgSend(token, chatId,
    `📎 <b>Email with Attachment</b>\n\n<b>Step 1 / 4</b> — Enter recipient email:`,
    { reply_markup: kbd([BTN_CANCEL]) }
  );
  return OK();
}

async function handleSettings(ctx) {
  const { token, chatId, env } = ctx;
  const settings = await getSettings(env);
  const { text, reply_markup } = settingsPanel(settings);
  await tgSend(token, chatId, text, { reply_markup });
  return OK();
}

async function handleList(ctx) {
  const { token, chatId, env } = ctx;
  const list = await env.EMAIL_STORE.list({ prefix: "email:" });
  if (list.keys.length === 0) {
    await tgSend(token, chatId, "📭 No emails stored.");
    return OK();
  }

  const NUMS = ["①", "②", "③", "④", "⑤"];
  const keys = list.keys.slice(0, 5);
  const raws = await Promise.all(keys.map(k => env.EMAIL_STORE.get(k.name)));

  const lines   = ["📋 <b>Recent emails:</b>"];
  const kbdRows = [];

  let i = 0;
  for (const raw of raws) {
    if (!raw) continue;
    const { id, fromName, subject, date } = JSON.parse(raw);
    lines.push(
      ``,
      `${NUMS[i]} <code>#${escHtml(id)}</code> — ${escHtml(subject)}`,
      `  <i>${escHtml(fromName)}  ·  ${escHtml(date)}</i>`,
    );
    kbdRows.push([
      btn(`↩️ Reply ${NUMS[i]}`,   `reply_start:${id}`),
      btn(`↗️ Forward ${NUMS[i]}`, `fwd_start:${id}`),
    ]);
    i++;
  }

  await tgSend(token, chatId, lines.join("\n"), { reply_markup: kbd(...kbdRows) });
  return OK();
}

async function handleHelp(ctx) {
  const { token, chatId } = ctx;
  await tgSend(token, chatId, [
    "📬 <b>engdawood.com Mail Bot</b>", "",
    "<b>Receiving:</b>",
    "Emails appear here automatically with quick-reply buttons.", "",
    "<b>Guided flows (step-by-step + preview):</b>",
    "<code>/reply &lt;id&gt;</code> — Reply to an email",
    "<code>/forward &lt;id&gt;</code> — Forward an email",
    "<code>/send</code> — Compose a new email",
    "<code>/attach</code> — Send an email with a file attachment",
    "<code>/cancel</code> — Cancel current draft", "",
    "<b>Other:</b>",
    "<code>/list</code> — Recent emails with reply/forward buttons",
    "<code>/settings</code> — Configure auto-forward (interactive)",
  ].join("\n"));
  return OK();
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function makeBotCtx(env, msg) {
  return {
    token:   env.TELEGRAM_BOT_TOKEN,
    chatId:  env.TELEGRAM_CHAT_ID,
    env,
    msg,
    text:    msg.text?.trim()    ?? "",
    caption: msg.caption?.trim() ?? "",
  };
}

export async function handleTelegramWebhook(request, env) {
  let update;
  try { update = await request.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  // ── Button press ──────────────────────────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query;
    if (String(cq.message?.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) return OK();
    await handleCallbackQuery(cq, env);
    return OK();
  }

  // ── Text / media messages ─────────────────────────────────────────────────
  const msg = update.message ?? update.edited_message;
  if (!msg) return OK();
  if (String(msg.chat?.id) !== String(env.TELEGRAM_CHAT_ID)) return OK();

  const ctx         = makeBotCtx(env, msg);
  const activeDraft = await getDraft(env, ctx.chatId);
  const hasFile     = !!(msg.document || msg.photo || msg.video || msg.audio);

  // File received while waiting for an attachment — continue the attach flow
  if (activeDraft?.step === "attach_file" && hasFile) {
    return handleDraftStep(ctx, activeDraft);
  }

  // /cancel — check BEFORE the draft-clear block so it can report what it cancelled
  if (ctx.text.match(/^\/cancel/i)) {
    if (activeDraft) {
      await clearDraft(env, ctx.chatId);
      await tgSend(ctx.token, ctx.chatId, "✅ Draft cancelled.");
    } else {
      await tgSend(ctx.token, ctx.chatId, "No active draft to cancel.");
    }
    return OK();
  }

  // Any text command silently clears the active draft, then routes
  if (ctx.text.startsWith("/")) {
    if (activeDraft) await clearDraft(env, ctx.chatId);

    if (ctx.text.match(/^\/reply/i))         return startReply(ctx);
    if (ctx.text.match(/^\/send/i))          return startSend(ctx);
    if (ctx.text.match(/^\/forward/i))       return startForward(ctx);
    if (ctx.text.match(/^\/attach/i))        return startAttach(ctx);
    if (ctx.text.startsWith("/settings"))    return handleSettings(ctx);
    if (ctx.text.startsWith("/list"))        return handleList(ctx);
    if (ctx.text.match(/^\/(help|start)/i))  return handleHelp(ctx);
    return OK();
  }

  // Free text input → advance the active draft to its next step
  if (activeDraft && ctx.text !== "") return handleDraftStep(ctx, activeDraft);

  return OK();
}
