import { handleEmail } from "./handlers/inbound-email.js";
import { handleTelegramWebhook } from "./handlers/telegram-webhook.js";
import { handleDashboardApi } from "./handlers/dashboard-api.js";

export default {
  async email(message, env, ctx) {
    await handleEmail(message, env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleDashboardApi(request, env);
    }
    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      return handleTelegramWebhook(request, env);
    }
    return new Response("mail worker", { status: 200 });
  },
};
