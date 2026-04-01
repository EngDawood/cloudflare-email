import type { Environment } from '../../types';

const TTL = 60 * 60; // 1 hour

export interface DraftState {
    type?: 'reply' | 'send' | 'forward' | 'settings';
    step?: string;
    emailId?: string;
    email?: any;
    to?: string;
    subject?: string;
    body?: string;
    settingsMsgId?: number;
    fileId?: string;
    filename?: string;
    mimeType?: string;
}

export async function getDraft(env: Environment, chatId: string | number): Promise<DraftState | null> {
    const raw = await env.EMAIL_STORE.get(`draft:${chatId}`);
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export async function saveDraft(env: Environment, chatId: string | number, draft: DraftState): Promise<void> {
    await env.EMAIL_STORE.put(`draft:${chatId}`, JSON.stringify(draft), { expirationTtl: TTL });
}

export async function clearDraft(env: Environment, chatId: string | number): Promise<void> {
    await env.EMAIL_STORE.delete(`draft:${chatId}`);
}
