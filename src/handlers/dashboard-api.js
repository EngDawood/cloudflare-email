import { sendEmail } from "../lib/email.js";
import { getSettings, saveSettings } from "../lib/settings.js";

const ALLOWED_ORIGINS = ["https://engdawood.com", "http://localhost:8787", "http://localhost:3000"];

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function handleDashboardApi(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || ALLOWED_ORIGINS[0];

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Simple API Key Auth
  const authHeader = request.headers.get("Authorization");
  const apiKey = env.DASHBOARD_API_KEY;

  if (!apiKey || authHeader !== "Bearer " + apiKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    // List Emails
    if (request.method === "GET" && url.pathname === "/api/emails") {
      const list = await env.EMAIL_STORE.list({ prefix: "email:" });
      const emails = await Promise.all(
        list.keys.map(async (key) => {
          const raw = await env.EMAIL_STORE.get(key.name);
          return raw ? JSON.parse(raw) : null;
        })
      );
      return new Response(JSON.stringify(emails.filter(Boolean)), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Get Single Email
    if (request.method === "GET" && url.pathname.startsWith("/api/emails/")) {
      const id = url.pathname.split("/").pop();
      const email = await env.EMAIL_STORE.get(`email:${id}`);
      if (!email) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
        });
      }
      return new Response(email, {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Delete Email
    if (request.method === "DELETE" && url.pathname.startsWith("/api/emails/")) {
      const id = url.pathname.split("/").pop();
      await env.EMAIL_STORE.delete(`email:${id}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Send Email
    if (request.method === "POST" && url.pathname === "/api/emails/send") {
      const body = await request.json();
      await sendEmail(env, {
        to: body.to,
        subject: body.subject,
        body: body.body,
        attachments: body.attachments || [],
        inReplyTo: body.inReplyTo || null,
      });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Get Settings
    if (request.method === "GET" && url.pathname === "/api/settings") {
      const settings = await getSettings(env);
      return new Response(JSON.stringify(settings), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    // Update Settings
    if (request.method === "POST" && url.pathname === "/api/settings") {
      const settings = await request.json();
      await saveSettings(env, settings);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
}
