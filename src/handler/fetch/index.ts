import type { IRequest, RouterType } from 'itty-router';
import type { AddressListStoreKey } from '../../db';
import type { Environment } from '../../types';
import { validate } from '@telegram-apps/init-data-node/web';
import { json, Router } from 'itty-router';
import { Dao } from '../../db';
import { createTelegramBotAPI, telegramCommands, telegramWebhookHandler, tmaHTML } from '../../telegram';
import { registerDashboardRoutes } from './dashboard';

class HTTPError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function createTmaAuthMiddleware(env: Environment): (req: Request) => Promise<void> {
    const {
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID,
    } = env;
    return async (req: Request): Promise<void> => {
        const [authType, authData = ''] = (req.headers.get('Authorization') || '').split(' ');
        if (authType !== 'tma') {
            throw new HTTPError(401, 'Invalid authorization type');
        }
        try {
            await validate(authData, TELEGRAM_BOT_TOKEN, {
                expiresIn: 3600,
            });
            const user = JSON.parse(new URLSearchParams(authData).get('user') || '{}');
            for (const id of TELEGRAM_CHAT_ID.split(',')) {
                if (id === `${user.id}`) {
                    return;
                }
            }
            throw new HTTPError(403, 'Permission denied');
        } catch (e) {
            throw new HTTPError(401, (e as Error).message);
        }
    };
}

type AddressType = 'block' | 'white';

function addressParamsCheck(address: string, type: AddressType): AddressListStoreKey {
    const keyMap: { [key in AddressType]: AddressListStoreKey } = {
        block: 'BLOCK_LIST',
        white: 'WHITE_LIST',
    };
    if (!address || !type) {
        throw new HTTPError(400, 'Missing address or type');
    }
    if (keyMap[type] === undefined) {
        throw new HTTPError(400, 'Invalid type');
    }
    return keyMap[type];
}

function errorHandler(error: Error): Response {
    if (error instanceof HTTPError) {
        return new Response(JSON.stringify({
            error: error.message,
        }), { status: error.status });
    }
    return new Response(JSON.stringify({
        error: error.message,
    }), { status: 500 });
}

function createRouter(env: Environment): RouterType {
    const router = Router({
        catch: errorHandler,
        finally: [json],
    });

    const {
        TELEGRAM_BOT_TOKEN,
        DOMAIN,
        EMAIL_STORE,
    } = env;
    const dao = new Dao(EMAIL_STORE);
    const auth = createTmaAuthMiddleware(env);

    router.get('/', async (): Promise<Response> => {
        return new Response(null, {
            status: 302,
            headers: {
                location: '/dashboard',
            },
        });
    });

    router.get('/init', async (): Promise<any> => {
        const api = createTelegramBotAPI(TELEGRAM_BOT_TOKEN);
        const webhook = await api.setWebhook({
            url: `https://${DOMAIN}/telegram/${TELEGRAM_BOT_TOKEN}/webhook`,
        });
        const commands = await api.setMyCommands({
            commands: telegramCommands,
        });
        return {
            webhook: await webhook.json(),
            commands: await commands.json(),
        };
    });

    /// Telegram Mini Apps

    router.get('/tma', async (): Promise<Response> => {
        return new Response(tmaHTML, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
            },
        });
    });

    // Register Web Dashboard APIs
    registerDashboardRoutes(router, env, auth);

    router.post('/api/address/add', auth, async (req: IRequest): Promise<any> => {
        const { address, type } = await req.json() as { address: string; type: AddressType };
        const key = addressParamsCheck(address, type);
        await dao.addAddress(address, key);
        return { success: true };
    });

    router.post('/api/address/remove', auth, async (req: IRequest): Promise<any> => {
        const { address, type } = await req.json() as { address: string; type: AddressType };
        const key = addressParamsCheck(address, type);
        await dao.removeAddress(address, key);
        return { success: true };
    });

    router.get('/api/address/list', auth, async (): Promise<any> => {
        const block = await dao.loadArrayFromDB('BLOCK_LIST');
        const white = await dao.loadArrayFromDB('WHITE_LIST');
        return { block, white };
    });

    /// Webhook

    router.post('/telegram/:token/webhook', async (req: IRequest): Promise<any> => {
        if (req.params.token !== TELEGRAM_BOT_TOKEN) {
            throw new HTTPError(403, 'Invalid token');
        }
        try {
            await telegramWebhookHandler(req, env);
        } catch (e) {
            console.error(e);
        }
        return { success: true };
    });

    /// Preview

    router.get('/email/:id', async (req: IRequest): Promise<Response> => {
        const id = req.params.id;
        const mode = req.query.mode || 'text';
        const value = await dao.loadMailCache(id);
        let text = value?.text || '';
        let contentType = 'text/plain; charset=utf-8';
        if (mode === 'html') {
            text = value?.html || '';
            contentType = 'text/html; charset=utf-8';
        }
        return new Response(text, {
            headers: { 'content-type': contentType },
        });
    });

    return router;
}

export async function fetchHandler(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);

    const router = createRouter(env);
    const response = await router.fetch(request);

    // If the router handled it (API, Webhook, etc.), return that response
    if (response) return response;

    // Otherwise, redirect root to dashboard
    if (url.pathname === '/' || url.pathname === '') {
        return Response.redirect(new URL('/dashboard', request.url).href, 302);
    }

    // For everything else (dashboard.html, js, css), let it fall through.
    // In Cloudflare Assets, if we return a non-handled response, it serves the asset.
    return new Response('Not Found', { status: 404 });
}
