import { escHtml } from "./utils.js";

export async function tgApi(token, method, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) console.error(`Telegram ${method} failed:`, res.status, await res.text());
  return res;
}

export async function tgSend(token, chatId, text, extra = {}) {
  return tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function tgEditMessage(token, chatId, messageId, text, extra = {}) {
  return tgApi(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function tgAnswerCallback(token, callbackQueryId, text = "") {
  return tgApi(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function tgSendDocument(token, chatId, filename, buffer, caption = "") {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("document", new Blob([buffer]), filename);
  return tgApi(token, "sendDocument", form);
}

export async function tgDownloadFile(token, fileId) {
  const meta = await (await tgApi(token, "getFile", { file_id: fileId })).json();
  if (!meta.ok) throw new Error(`getFile failed: ${JSON.stringify(meta)}`);
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.arrayBuffer();
}

// Wraps an async action and sends a Telegram error message on failure
export async function withTgErrorHandler(token, chatId, action, failMsg) {
  try {
    await action();
  } catch (err) {
    await tgSend(token, chatId, `❌ ${escHtml(failMsg)}: ${escHtml(err.message)}`);
  }
}
