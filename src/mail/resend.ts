import type { EmailCache } from '../types';

function buildHtml(body: string): string {
    const lines = body
        .split('\n')
        .map(l => l === '' ? '<br>' : `<p style="margin:0 0 8px">${l}</p>`)
        .join('\n');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  <div style="line-height:1.6">${lines}</div>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5">
</body>
</html>`;
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export interface SendEmailOptions {
    to: string;
    subject: string;
    body: string;
    attachments?: any[];
    inReplyTo?: string | null;
}

export async function replyToEmail(token: string, email: EmailCache, message: string): Promise<void> {
    await sendEmail(token, email.to, {
        to: email.from,
        subject: `Re: ${email.subject}`,
        body: message,
        inReplyTo: email.messageId,
    });
}

export async function sendEmail(token: string, from: string, opts: SendEmailOptions): Promise<void> {
    const payload: any = {
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.body,
        html: buildHtml(opts.body),
    };

    if (opts.inReplyTo) {
        payload.headers = { 'In-Reply-To': opts.inReplyTo };
    }

    if (opts.attachments && opts.attachments.length > 0) {
        payload.attachments = opts.attachments.map(att => ({
            filename: att.filename,
            content: att.buffer ? bufferToBase64(att.buffer) : att.content,
        }));
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText })) as any;
        throw new Error(err.message || `Resend error ${res.status}`);
    }
}
