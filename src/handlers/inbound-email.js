import PostalMime from "postal-mime";
import { streamToArrayBuffer, shortId, truncate, escHtml } from "../lib/utils.js";
import { tgSend, tgSendDocument } from "../lib/telegram.js";
import { sendEmail } from "../lib/email.js";
import { getSettings } from "../lib/settings.js";

export async function handleEmail(message, env) {
  console.log(JSON.stringify({ event: "email_received", from: message.from, to: message.to }));

  // Forward early via Cloudflare native routing — happens before anything else
  // so email is never lost even if the rest of the handler throws.
  if (env.FORWARD_EMAIL) {
    await message.forward(env.FORWARD_EMAIL).catch(() => {});
  }

  const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
  const parsed = await new PostalMime().parse(rawEmail);

  const id = shortId();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const from = parsed.from?.address ?? message.from;
  const fromName = parsed.from?.name ? `${parsed.from.name} <${from}>` : from;
  const subject = parsed.subject ?? "(no subject)";
  const body = parsed.text ?? parsed.html?.replace(/<[^>]+>/g, "") ?? "(empty body)";
  const date = parsed.date ?? new Date().toISOString();

  const attCount = parsed.attachments?.length ?? 0;
  const tgText = [
    `📨 <b>New email #${escHtml(id)}</b>`, ``,
    `<b>From:</b> ${escHtml(fromName)}`,
    `<b>To:</b> ${escHtml(message.to)}`,
    `<b>Subject:</b> ${escHtml(subject)}`,
    `<b>Date:</b> ${escHtml(date)}`,
    attCount ? `<b>Attachments:</b> ${attCount}` : null, ``,
    escHtml(truncate(body)), ``,
    `<i>/reply ${escHtml(id)} &lt;your reply&gt;</i>`,
  ].filter(Boolean).join("\n");

  // KV store and settings fetch must succeed; Telegram notification is best-effort
  const [kvResult, settingsResult, tgResult] = await Promise.allSettled([
    env.EMAIL_STORE.put(
      `email:${id}`,
      JSON.stringify({ id, from, fromName, to: message.to, subject, date,
        messageId: parsed.messageId ?? null, body: body.slice(0, 2000) }),
      { expirationTtl: 60 * 60 * 24 * 30 }
    ),
    getSettings(env),
    tgSend(token, chatId, tgText),
  ]);

  if (kvResult.status === "rejected") {
    console.error(JSON.stringify({ event: "email_kv_failed", from: message.from, error: kvResult.reason?.message }));
    throw kvResult.reason;
  }

  if (tgResult.status === "rejected") {
    console.warn(JSON.stringify({ event: "email_tg_failed", from: message.from, error: tgResult.reason?.message }));
  }

  console.log(JSON.stringify({ event: "email_stored", id, from, subject }));

  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : {};

  // Forward attachments to Telegram (parallel)
  await Promise.allSettled(
    (parsed.attachments ?? [])
      .filter(att => att.content)
      .map(att => tgSendDocument(token, chatId, att.filename ?? "attachment", att.content,
        `📎 Attachment from email #${id}: ${att.filename ?? "file"}`))
  );

  if (settings.autoForward) {
    try {
      await sendEmail(env, {
        to: settings.autoForward,
        subject: `Fwd: ${subject}`,
        body: `---------- Forwarded message ----------\nFrom: ${fromName}\nDate: ${date}\nSubject: ${subject}\nTo: ${message.to}\n\n${body}`,
      });
    } catch (err) {
      await tgSend(token, chatId, `⚠️ Auto-forward to ${escHtml(settings.autoForward)} failed: ${escHtml(err.message)}`);
    }
  }
}
