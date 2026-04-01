import type { Ai, KVNamespace } from '@cloudflare/workers-types';

export interface EmailHandleStatus {
    telegram: boolean;
    forward: string[];
}

export interface EmailCache {
    id: string;
    messageId: string;
    from: string;
    fromName?: string;
    to: string;
    subject: string;
    date?: string;
    html?: string;
    text?: string;
    body?: string;
}

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

export interface Environment {
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    FORWARD_EMAIL: string;
    BLOCK_LIST: string;
    WHITE_LIST: string;
    DISABLE_LOAD_REGEX_FROM_DB: string;
    BLOCK_POLICY: string;
    MAIL_TTL: string;
    DOMAIN: string;
    MAX_EMAIL_SIZE?: string;
    MAX_EMAIL_SIZE_POLICY?: MaxEmailSizePolicy;
    OPENAI_API_KEY?: string;
    OPENAI_COMPLETIONS_API?: string;
    OPENAI_CHAT_MODEL?: string;
    WORKERS_AI_MODEL?: string;
    SUMMARY_TARGET_LANG?: string;
    GUARDIAN_MODE?: string;
    RESEND_API_KEY?: string;
    DASHBOARD_API_KEY?: string;
    EMAIL_STORE: KVNamespace;
    AI?: Ai;
    ASSETS: { fetch: (request: Request) => Promise<Response> };
    DEBUG?: string;
}
