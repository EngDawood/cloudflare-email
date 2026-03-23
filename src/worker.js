import { handleEmail } from "./handlers/inbound-email.js";
import { handleTelegramWebhook } from "./handlers/telegram-webhook.js";
import { handleApiRequest } from "./handlers/api.js";

export default {
  async email(message, env, ctx) {
    await handleEmail(message, env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Telegram webhook
    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      return handleTelegramWebhook(request, env);
    }
    
    // API routes for dashboard
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env);
    }
    
    return new Response("mail worker", { status: 200 });
  },
};
