export async function streamToArrayBuffer(stream, size) {
  const reader = stream.getReader();
  if (size != null) {
    const result = new Uint8Array(size);
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.set(value, bytesRead);
      bytesRead += value.length;
    }
    return result.buffer.slice(0, bytesRead);
  }
  // Size unknown: accumulate chunks dynamically
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result.buffer;
}

export function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

export function truncate(text, max = 400) {
  if (!text || text.length <= max) return text ?? "";
  return text.slice(0, max) + "…";
}

// MarkdownV2 escaping (kept for reference)
export function esc(text) {
  return String(text ?? "").replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

// HTML escaping for Telegram HTML parse mode
export function escHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Safe base64 encoding for binary buffers — avoids call-stack overflow from spread
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 4096) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return btoa(binary);
}
