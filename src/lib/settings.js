export async function getSettings(env) {
  const raw = await env.EMAIL_STORE.get("settings");
  return raw ? JSON.parse(raw) : { autoForward: null };
}

export async function saveSettings(env, settings) {
  await env.EMAIL_STORE.put("settings", JSON.stringify(settings));
}
