// Simple JWT implementation for Cloudflare Workers using Web Crypto API

const ALGORITHM = { name: "HMAC", hash: "SHA-256" };
const TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const MAGIC_LINK_EXPIRY = 15 * 60; // 15 minutes in seconds

function base64UrlEncode(data) {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

async function getKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), ALGORITHM, false, ["sign", "verify"]);
}

async function sign(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign(ALGORITHM, key, new TextEncoder().encode(data));
  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
  
  return `${data}.${encodedSignature}`;
}

async function verify(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const key = await getKey(secret);
  const signatureBytes = Uint8Array.from(base64UrlDecode(encodedSignature), c => c.charCodeAt(0));
  
  const valid = await crypto.subtle.verify(ALGORITHM, key, signatureBytes, new TextEncoder().encode(data));
  if (!valid) return null;
  
  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  
  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  
  return payload;
}

export async function createMagicLinkToken(email, secret) {
  const payload = {
    email,
    type: "magic_link",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + MAGIC_LINK_EXPIRY,
  };
  return sign(payload, secret);
}

export async function verifyMagicLinkToken(token, secret) {
  const payload = await verify(token, secret);
  if (!payload || payload.type !== "magic_link") return null;
  return payload;
}

export async function createSessionToken(email, secret) {
  const payload = {
    email,
    type: "session",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY,
  };
  return sign(payload, secret);
}

export async function verifySessionToken(token, secret) {
  const payload = await verify(token, secret);
  if (!payload || payload.type !== "session") return null;
  return payload;
}
