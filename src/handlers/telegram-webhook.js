import { escHtml } from "../lib/utils.js";
import { tgSend, tgEditMessage, tgAnswerCallback, tgDownloadFile } from "../lib/telegram.js";
import { sendEmail } from "../lib/email.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { getDraft, saveDraft, clearDraft } from "../lib/draft.js";

const OK = () => new Response("OK");
const HR = "─".repeat(28);
const NUMS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

// ─── Inline keyboard helpers ──────────────────────────────────────────────────

const btn = (text, data) => ({ text, callback_data: data });
const kbd = (...rows)    => ({ inline_keyboard: rows });

const BTN_SEND   = btn("✅ Send",             "confirm");
const BTN_CANCEL = btn("❌ Cancel draft",      "cancel");
const BTN_RETYPE = btn("✏️ Re-type",          "edit_body");
const BTN_EDIT   = btn("✏️ Edit all",         "edit_all");
const BTN_BACK   = btn("⬅️ Back to preview",  "back_to_preview");

const attachBtn = (hasFIle) => hasFIle
  ? btn("🗑️ Remove file", "remove_attach")
  : btn("📎 Add file",    "attach_file");

// Build the preview keyboard based on draft type and whether a file is attached
function previewKbd(draft) {
  const row1 = [BTN_SEND, BTN_CANCEL];
  const aBtn = attachBtn(!!draft.filename);
  if (draft.type === "reply")   return kbd(row1, [BTN_RETYPE, aBtn]);
  if (draft.type === "send")    return kbd(row1, [BTN_EDIT,   aBtn]);
  if (draft.type === "forward") return kbd(row1, [aBtn]);
  return kbd(row1);
}

// ─── Preview templates ────────────────────────────────────────────────────────

function fileTag(draft) {
  return draft.filename
    ? `\n<b>📎 File:</b> <code>${escHtml(draft.filename)}</code> <i>${escHtml(draft.mimeType)}</i>`
    : "";
}

function replyPreview(draft) {
  const { email, body } = draft;
  return [
    `📤 <b>Preview — Reply</b>`, ``,
    `<b>To:</b> ${escHtml(email.fromName ?? email.from)}`,
    `<b>Subject:</b> ${escHtml(`Re: ${email.subject}`)}`,
    ``, `<code>${HR}</code>`, escHtml(body), `<code>${HR}</code>`,
    fileTag(draft),
  ].filter(v => v !== "").join("\n");
}

function sendPreview(draft) {
  const { to, subject, body } = draft;
  return [
    `📤 <b>Preview — New Email</b>`, ``,
    `<b>To:</b> ${escHtml(to)}`,
    `<b>Subject:</b> ${escHtml(subject)}`,
    ``, `<code>${HR}</code>`, escHtml(body), `<code>${HR}</code>`,
    fileTag(draft),
  ].filter(v => v !== "").join("\n");
}

function forwardPreview(draft) {
  const { to, email } = draft;
  const body = [
    `---------- Forwarded message ----------`,
    `From: ${email.fromName ?? email.from}`,
    `Date: ${email.date}`, `Subject: ${email.subject}`, `To: ${email.to}`,
    ``, email.body ?? "",
  ].join("\n");
  return [
    `📤 <b>Preview — Forward</b>`, ``,
    `<b>To:</b> ${escHtml(to)}`,
    `<b>Subject:</b> ${escHtml(`Fwd: ${email.subject}`)}`,
    ``, `<code>${HR}</code>`, escHtml(body.slice(0, 600)), `<code>${HR}</code>`,
    fileTag(draft),
  ].filter(v => v !== "").join("\n");
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

// ─── File helpers ─────────────────────────────────────────────────────────────

function extractFileInfo(msg) {
  if (msg.document) return { fileId: msg.document.file_id, filename: msg.document.file_name  ?? "attachment",  mimeType: msg.document.mime_type  ?? "application/octet-stream" };
  if (msg.photo)    return { fileId: msg.photo.at(-1).file_id, filename: "photo.jpg",           mimeType: "image/jpeg" };
  if (msg.video)    return { fileId: msg.video.file_id,    filename: msg.video.file_name    ?? "video.mp4",    mimeType: msg.video.mime_type    ?? "video/mp4" };
  if (msg.audio)    return { fileId: msg.audio.file_id,    filename: msg.audio.file_name    ?? "audio",        mimeType: msg.audio.mime_type    ?? "audio/mpeg" };
  return null;
}

async function buildAttachments(token, draft) {
  if (!draft.fileId) return [];
  const buffer = await tgDownloadFile(token, draft.fileId);
  return [{ filename: draft.filename, buffer, mimeType: draft.mimeType }];
}

// Sends the right preview message for any draft type
async function sendDraftPreview(token, chatId, draft) {
  let text;
  if (draft.type === "reply")   text = replyPreview(draft);
  if (draft.type === "send")    text = sendPreview(draft);
  if (draft.type === "forward") text = forwardPreview(draft);
  await tgSend(token, chatId, text, { reply_markup: previewKbd(draft) });
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
      await sendDraftPreview(token, chatId, draft);
      break;

    case "send_to":
      draft.to = text;
      draft.step = "send_subject";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 2 / 3</b> — Enter subject:`, { reply_markup: kbd([BTN_CANCEL]) });
      break;

    case "send_subject":
      draft.subject = text;
      draft.step = "send_body";
      await saveDraft(env, chatId, draft);
      await tgSend(token, chatId, `<b>Step 3 / 3</b> — Enter message body:`, { reply_markup: kbd([BTN_CANCEL]) });
      break;

    case "send_body":
      draft.body = text;
      draft.step = "preview";
      await saveDraft(env, chatId, draft);
      await sendDraftPreview(token, chatId, draft);
      break;

    case "forward_to":
      draft.to = text;
      draft.step = "preview";
      await saveDraft(env, chatId, draft);
      await sendDraftPreview(token, chatId, draft);
      break;

    case "awaiting_file": {
      const info = extractFileInfo(msg);
      if (!info) {
        await tgSend(token, chatId, "📎 Please send a file (document, photo, video, or audio).");
        return OK();
      }
      Object.assign(draft, info, { step: "preview" });
      await saveDraft(env, chatId, draft);
      await sendDraftPreview(token, chatId, draft);
      break;
    }

    case "settings_addr": {
      const addr = text.trim();
      await saveSettings(env, { autoForward: addr });
      await clearDraft(env, chatId);
      if (draft.settingsMsgId) {
        const { text: t, reply_markup } = settingsPanel({ autoForward: addr });
        await tgEditMessage(token, chatId, draft.settingsMsgId, t, { reply_markup });
      }
      await tgSend(token, chatId, `✅ <b>Auto-forward enabled</b>\nForwarding to: <code>${escHtml(addr)}</code>`);
      break;
    }
  }

  return OK();
}

// ─── Callback query handler ───────────────────────────────────────────────────

async function handleCallbackQuery(cq, env) {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const { id: queryId, data, message: cbMsg } = cq;

  await tgAnswerCallback(token, queryId);

  // ── Start new flows from /recent list buttons ──────────────────────────────

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
      ``, `<code>${HR}</code>`, escHtml((email.body ?? "").slice(0, 600)), `<code>${HR}</code>`, ``,
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
      ``, `<code>${HR}</code>`, escHtml((email.body ?? "").slice(0, 400)), `<code>${HR}</code>`, ``,
      `✉️ <i>Enter the destination email address:</i>`,
    ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
    await saveDraft(env, chatId, { type: "forward", step: "forward_to", emailId: id, email });
    return;
  }

  // ── Settings actions ───────────────────────────────────────────────────────

  if (data === "settings_disable") {
    await saveSettings(env, { autoForward: null });
    const { text, reply_markup } = settingsPanel({ autoForward: null });
    await tgEditMessage(token, chatId, cbMsg.message_id, text, { reply_markup });
    return;
  }

  if (data === "settings_set_addr") {
    await clearDraft(env, chatId);
    await saveDraft(env, chatId, { type: "settings", step: "settings_addr", settingsMsgId: cbMsg.message_id });
    await tgSend(token, chatId, `📧 Enter the email address to forward to:`, { reply_markup: kbd([BTN_CANCEL]) });
    return;
  }

  // ── Attachment actions ─────────────────────────────────────────────────────

  if (data === "attach_file") {
    const draft = await getDraft(env, chatId);
    if (!draft) { await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>This draft has expired.</i>"); return; }
    draft.step = "awaiting_file";
    await saveDraft(env, chatId, draft);
    await tgSend(token, chatId, `📎 <i>Send the file to attach:</i>`, { reply_markup: kbd([BTN_BACK, BTN_CANCEL]) });
    return;
  }

  if (data === "remove_attach") {
    const draft = await getDraft(env, chatId);
    if (!draft) { await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>This draft has expired.</i>"); return; }
    delete draft.fileId;
    delete draft.filename;
    delete draft.mimeType;
    draft.step = "preview";
    await saveDraft(env, chatId, draft);
    await tgEditMessage(token, chatId, cbMsg.message_id, "🗑️ <i>Attachment removed.</i>");
    await sendDraftPreview(token, chatId, draft);
    return;
  }

  if (data === "back_to_preview") {
    const draft = await getDraft(env, chatId);
    if (!draft) { await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>This draft has expired.</i>"); return; }
    draft.step = "preview";
    await saveDraft(env, chatId, draft);
    await tgEditMessage(token, chatId, cbMsg.message_id, "⬅️ <i>Back to preview.</i>");
    await sendDraftPreview(token, chatId, draft);
    return;
  }

  // ── Actions that require an existing draft ─────────────────────────────────

  const draft = await getDraft(env, chatId);
  if (!draft) { await tgEditMessage(token, chatId, cbMsg.message_id, "❌ <i>This draft has expired.</i>"); return; }

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
    await tgSend(token, chatId, `📧 <b>New Email</b>\n\n<b>Step 1 / 3</b> — Enter recipient email:`, { reply_markup: kbd([BTN_CANCEL]) });
    return;
  }

  if (data === "confirm") {
    try {
      const attachments = await buildAttachments(token, draft);
      let successText;

      if (draft.type === "reply") {
        await sendEmail(env, { to: draft.email.from, subject: `Re: ${draft.email.subject}`, body: draft.body, inReplyTo: draft.email.messageId, attachments });
        successText = [
          `✅ <b>Reply sent</b>`,
          `<b>To:</b> ${escHtml(draft.email.fromName ?? draft.email.from)}`,
          `<b>Subject:</b> ${escHtml(`Re: ${draft.email.subject}`)}`,
          draft.filename ? `<b>📎 File:</b> <code>${escHtml(draft.filename)}</code>` : null,
        ].filter(Boolean).join("\n");

      } else if (draft.type === "send") {
        await sendEmail(env, { to: draft.to, subject: draft.subject, body: draft.body, attachments });
        successText = [
          `✅ <b>Email sent</b>`,
          `<b>To:</b> ${escHtml(draft.to)}`,
          `<b>Subject:</b> ${escHtml(draft.subject)}`,
          draft.filename ? `<b>📎 File:</b> <code>${escHtml(draft.filename)}</code>` : null,
        ].filter(Boolean).join("\n");

      } else if (draft.type === "forward") {
        const fwdBody = [
          `---------- Forwarded message ----------`,
          `From: ${draft.email.fromName ?? draft.email.from}`,
          `Date: ${draft.email.date}`, `Subject: ${draft.email.subject}`, `To: ${draft.email.to}`,
          ``, draft.email.body ?? "",
        ].join("\n");
        await sendEmail(env, { to: draft.to, subject: `Fwd: ${draft.email.subject}`, body: fwdBody, attachments });
        successText = [
          `✅ <b>Email forwarded</b>`,
          `<b>To:</b> ${escHtml(draft.to)}`,
          `<b>Subject:</b> ${escHtml(`Fwd: ${draft.email.subject}`)}`,
          draft.filename ? `<b>📎 File:</b> <code>${escHtml(draft.filename)}</code>` : null,
        ].filter(Boolean).join("\n");
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
    ``, `<code>${HR}</code>`, escHtml((email.body ?? "").slice(0, 600)), `<code>${HR}</code>`, ``,
    `✏️ <i>Type your reply message:</i>`,
  ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
  await saveDraft(env, chatId, { type: "reply", step: "reply_body", emailId: id, email });
  return OK();
}

async function startSend(ctx) {
  const { token, chatId, env } = ctx;
  await saveDraft(env, chatId, { type: "send", step: "send_to" });
  await tgSend(token, chatId, `📧 <b>New Email</b>\n\n<b>Step 1 / 3</b> — Enter recipient email:`, { reply_markup: kbd([BTN_CANCEL]) });
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
    ``, `<code>${HR}</code>`, escHtml((email.body ?? "").slice(0, 400)), `<code>${HR}</code>`, ``,
    `✉️ <i>Enter the destination email address:</i>`,
  ].join("\n"), { reply_markup: kbd([BTN_CANCEL]) });
  await saveDraft(env, chatId, { type: "forward", step: "forward_to", emailId: id, email });
  return OK();
}

async function handleSettings(ctx) {
  const { token, chatId, env } = ctx;
  const settings = await getSettings(env);
  const { text, reply_markup } = settingsPanel(settings);
  await tgSend(token, chatId, text, { reply_markup });
  return OK();
}

async function handleRecent(ctx) {
  const { token, chatId, env, text } = ctx;
  const m = text.match(/\b(\d+)$/);
  const n = Math.min(Math.max(parseInt(m?.[1] ?? "5"), 1), 10);

  const list = await env.EMAIL_STORE.list({ prefix: "email:" });
  if (list.keys.length === 0) { await tgSend(token, chatId, "📭 No emails stored."); return OK(); }

  // Load all stored emails, sort by date descending, take n
  const all  = await Promise.all(list.keys.map(k => env.EMAIL_STORE.get(k.name)));
  const emails = all
    .filter(Boolean)
    .map(r => JSON.parse(r))
    .sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0))
    .slice(0, n);

  const lines   = [`📋 <b>Last ${emails.length} email${emails.length !== 1 ? "s" : ""}:</b>`];
  const kbdRows = [];

  emails.forEach(({ id, fromName, subject, date }, i) => {
    lines.push(
      ``,
      `${NUMS[i]} <code>#${escHtml(id)}</code> — ${escHtml(subject)}`,
      `  <i>${escHtml(fromName)}  ·  ${escHtml(date)}</i>`,
    );
    kbdRows.push([
      btn(`↩️ Reply ${NUMS[i]}`,   `reply_start:${id}`),
      btn(`↗️ Forward ${NUMS[i]}`, `fwd_start:${id}`),
    ]);
  });

  await tgSend(token, chatId, lines.join("\n"), { reply_markup: kbd(...kbdRows) });
  return OK();
}

async function handleHelp(ctx) {
  const { token, chatId } = ctx;
  await tgSend(token, chatId, [
    "📬 <b>engdawood.com Mail Bot</b>", "",
    "<b>Receiving:</b>",
    "Emails appear here automatically with quick-reply buttons.", "",
    "<b>Guided flows (with preview before sending):</b>",
    "<code>/reply &lt;id&gt;</code> — Reply to an email",
    "<code>/forward &lt;id&gt;</code> — Forward an email",
    "<code>/send</code> — Compose a new email",
    "<i>Attach a file via the 📎 button in any preview</i>",
    "<code>/cancel</code> — Cancel current draft", "",
    "<b>Other:</b>",
    "<code>/recent</code> — Last 5 emails with reply/forward buttons",
    "<code>/recent 10</code> — Last N emails (max 10)",
    "<code>/settings</code> — Configure auto-forward",
  ].join("\n"));
  return OK();
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function makeBotCtx(env, msg) {
  return {
    token:  env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    env, msg,
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

  // File received while waiting for an attachment — continue the flow
  if (activeDraft?.step === "awaiting_file" && hasFile) {
    return handleDraftStep(ctx, activeDraft);
  }

  // /cancel — before the draft-clear block so it can report what it cancelled
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

    if (ctx.text.match(/^\/reply/i))                               return startReply(ctx);
    if (ctx.text.match(/^\/send/i))                                return startSend(ctx);
    if (ctx.text.match(/^\/forward/i))                             return startForward(ctx);
    if (ctx.text.startsWith("/settings"))                          return handleSettings(ctx);
    if (ctx.text.match(/^\/(recent|list)/i))                       return handleRecent(ctx);
    if (ctx.text.match(/^\/(help|start)/i))                        return handleHelp(ctx);
    return OK();
  }

  // Free text → advance the active draft to its next step
  if (activeDraft && ctx.text !== "") return handleDraftStep(ctx, activeDraft);

  return OK();
}
