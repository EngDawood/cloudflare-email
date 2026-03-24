import { bufferToBase64 } from "./utils.js";

export async function sendEmail(env, { to, subject, body, attachments = [], inReplyTo = null }) {
  const payload = {
    from: "Eng. Dawood <admin@engdawood.com>",
    to: [to],
    subject,
    text: body,
  };

  if (inReplyTo) {
    payload.headers = { "In-Reply-To": inReplyTo };
  }

  if (attachments.length > 0) {
    payload.attachments = attachments.map((att) => ({
      filename: att.filename,
      content: bufferToBase64(att.buffer),
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Resend error " + res.status);
  }
}
