import { createMimeMessage } from "mimetext";
import { bufferToBase64 } from "./utils.js";

export async function sendEmail(env, { to, subject, body, attachments = [], inReplyTo = null }) {
  const mime = createMimeMessage();
  mime.setSender({ name: "Eng. Dawood", addr: "admin@engdawood.com" });
  mime.setRecipient(to);
  mime.setSubject(subject);
  if (inReplyTo) mime.setHeader("In-Reply-To", inReplyTo);
  mime.addMessage({ contentType: "text/plain", data: body });
  for (const att of attachments) {
    mime.addAttachment({
      filename: att.filename,
      contentType: att.mimeType,
      data: bufferToBase64(att.buffer),
    });
  }
  await env.SEND_EMAIL.send({ from: "admin@engdawood.com", to, raw: mime.asRaw() });
}
