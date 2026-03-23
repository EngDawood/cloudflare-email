import { handleEmail } from "./handlers/inbound-email.js";
import { handleTelegramWebhook } from "./handlers/telegram-webhook.js";

export default {
  async email(message, env, ctx) {
    await handleEmail(message, env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      return handleTelegramWebhook(request, env);
    }
    return new Response("mail worker", { status: 200 });
  },
};
