import { sendEmail } from "../lib/email.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import {
  createMagicLinkToken,
  verifyMagicLinkToken,
  createSessionToken,
  verifySessionToken,
} from "../lib/auth.js";

const ALLOWED_EMAIL = "admin@engdawood.com";
const DASHBOARD_URL = "https://dashboard.engdawood.com";

// CORS headers for cross-origin requests from the dashboard
const corsHeaders = {
  "Access-Control-Allow-Origin": DASHBOARD_URL,
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

// Middleware to verify JWT auth
async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: error("Unauthorized", 401) };
  }
  
  const token = authHeader.slice(7);
  const payload = await verifySessionToken(token, env.JWT_SECRET);
  
  if (!payload) {
    return { error: error("Invalid or expired token", 401) };
  }
  
  return { user: payload };
}

// ─── Auth Routes ────────────────────────────────────────────────────────────────

async function handleMagicLink(request, env) {
  const body = await request.json();
  const { email } = body;
  
  if (!email || email.toLowerCase() !== ALLOWED_EMAIL) {
    return error("Invalid email address", 403);
  }
  
  const token = await createMagicLinkToken(email, env.JWT_SECRET);
  const magicLink = `${DASHBOARD_URL}/auth/verify?token=${token}`;
  
  // Send magic link via email
  await sendEmail(env, {
    to: email,
    subject: "Sign in to Mail Dashboard",
    body: `Click this link to sign in to your mail dashboard:\n\n${magicLink}\n\nThis link will expire in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
  });
  
  return json({ success: true, message: "Magic link sent" });
}

async function handleVerifyToken(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  
  if (!token) {
    return error("Token required", 400);
  }
  
  const payload = await verifyMagicLinkToken(token, env.JWT_SECRET);
  
  if (!payload) {
    return error("Invalid or expired magic link", 401);
  }
  
  // Create session token
  const sessionToken = await createSessionToken(payload.email, env.JWT_SECRET);
  
  return json({ token: sessionToken, email: payload.email });
}

async function handleLogout() {
  // Logout is handled client-side by clearing the cookie
  // This endpoint just confirms the logout action
  return json({ success: true });
}

// ─── Email Routes ───────────────────────────────────────────────────────────────

async function handleGetEmails(env) {
  const list = await env.EMAIL_STORE.list({ prefix: "email:" });
  
  const emails = await Promise.all(
    list.keys.map(async (key) => {
      const raw = await env.EMAIL_STORE.get(key.name);
      if (!raw) return null;
      return JSON.parse(raw);
    })
  );
  
  // Filter nulls and sort by date (newest first)
  const sortedEmails = emails
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  
  return json({ emails: sortedEmails, cursor: list.cursor || null });
}

async function handleGetEmail(env, emailId) {
  const raw = await env.EMAIL_STORE.get(`email:${emailId}`);
  
  if (!raw) {
    return error("Email not found", 404);
  }
  
  return json(JSON.parse(raw));
}

async function handleSendEmail(request, env) {
  const body = await request.json();
  const { to, subject, body: emailBody, attachment } = body;
  
  if (!to || !subject || !emailBody) {
    return error("Missing required fields: to, subject, body");
  }
  
  try {
    await sendEmail(env, {
      to,
      subject,
      body: emailBody,
      attachments: attachment ? [attachment] : [],
    });
    
    return json({ success: true, message: "Email sent" });
  } catch (err) {
    return error(`Failed to send email: ${err.message}`, 500);
  }
}

async function handleReplyEmail(request, env) {
  const body = await request.json();
  const { emailId, body: replyBody } = body;
  
  if (!emailId || !replyBody) {
    return error("Missing required fields: emailId, body");
  }
  
  const raw = await env.EMAIL_STORE.get(`email:${emailId}`);
  if (!raw) {
    return error("Email not found", 404);
  }
  
  const email = JSON.parse(raw);
  
  try {
    await sendEmail(env, {
      to: email.from,
      subject: `Re: ${email.subject}`,
      body: replyBody,
      inReplyTo: email.messageId,
    });
    
    return json({ success: true, message: "Reply sent" });
  } catch (err) {
    return error(`Failed to send reply: ${err.message}`, 500);
  }
}

async function handleForwardEmail(request, env) {
  const body = await request.json();
  const { emailId, to } = body;
  
  if (!emailId || !to) {
    return error("Missing required fields: emailId, to");
  }
  
  const raw = await env.EMAIL_STORE.get(`email:${emailId}`);
  if (!raw) {
    return error("Email not found", 404);
  }
  
  const email = JSON.parse(raw);
  
  const forwardBody = [
    `---------- Forwarded message ----------`,
    `From: ${email.fromName ?? email.from}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    `To: ${email.to}`,
    ``,
    email.body ?? "",
  ].join("\n");
  
  try {
    await sendEmail(env, {
      to,
      subject: `Fwd: ${email.subject}`,
      body: forwardBody,
    });
    
    return json({ success: true, message: "Email forwarded" });
  } catch (err) {
    return error(`Failed to forward email: ${err.message}`, 500);
  }
}

async function handleDeleteEmail(env, emailId) {
  const raw = await env.EMAIL_STORE.get(`email:${emailId}`);
  
  if (!raw) {
    return error("Email not found", 404);
  }
  
  await env.EMAIL_STORE.delete(`email:${emailId}`);
  
  return json({ success: true, message: "Email deleted" });
}

// ─── Settings Routes ────────────────────────────────────────────────────────────

async function handleGetSettings(env) {
  const settings = await getSettings(env);
  return json(settings);
}

async function handleSaveSettings(request, env) {
  const body = await request.json();
  const { autoForward } = body;
  
  await saveSettings(env, { autoForward: autoForward || null });
  
  return json({ success: true, message: "Settings saved" });
}

// ─── Router ─────────────────────────────────────────────────────────────────────

export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  // ── Public Auth Routes ──────────────────────────────────────────────────────
  
  if (path === "/api/auth/magic-link" && method === "POST") {
    return handleMagicLink(request, env);
  }
  
  if (path === "/api/auth/verify" && method === "GET") {
    return handleVerifyToken(request, env);
  }
  
  // ── Protected Routes ────────────────────────────────────────────────────────
  
  const auth = await requireAuth(request, env);
  if (auth.error) return auth.error;
  
  // Auth
  if (path === "/api/auth/logout" && method === "POST") {
    return handleLogout();
  }
  
  // Emails
  if (path === "/api/emails" && method === "GET") {
    return handleGetEmails(env);
  }
  
  if (path.match(/^\/api\/emails\/[\w-]+$/) && method === "GET") {
    const emailId = path.split("/").pop();
    return handleGetEmail(env, emailId);
  }
  
  if (path.match(/^\/api\/emails\/[\w-]+$/) && method === "DELETE") {
    const emailId = path.split("/").pop();
    return handleDeleteEmail(env, emailId);
  }
  
  if (path === "/api/send" && method === "POST") {
    return handleSendEmail(request, env);
  }
  
  if (path === "/api/reply" && method === "POST") {
    return handleReplyEmail(request, env);
  }
  
  if (path === "/api/forward" && method === "POST") {
    return handleForwardEmail(request, env);
  }
  
  // Settings
  if (path === "/api/settings" && method === "GET") {
    return handleGetSettings(env);
  }
  
  if (path === "/api/settings" && method === "POST") {
    return handleSaveSettings(request, env);
  }
  
  // 404 for unknown API routes
  return error("Not found", 404);
}
