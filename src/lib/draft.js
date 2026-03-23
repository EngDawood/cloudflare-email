const TTL = 60 * 60; // 1 hour

export async function getDraft(env, chatId) {
  const raw = await env.EMAIL_STORE.get(`draft:${chatId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveDraft(env, chatId, draft) {
  await env.EMAIL_STORE.put(`draft:${chatId}`, JSON.stringify(draft), { expirationTtl: TTL });
}

export async function clearDraft(env, chatId) {
  await env.EMAIL_STORE.delete(`draft:${chatId}`);
}
