import type { IRequest, RouterType } from 'itty-router';
import type { Environment } from '../../types';
import { Dao } from '../../db';
import { sendEmail } from '../../mail/resend';

export function registerDashboardRoutes(router: RouterType, env: Environment, authMiddleware: any) {
    const { EMAIL_STORE } = env;
    const dao = new Dao(EMAIL_STORE);

    // List Emails
    router.get('/api/emails', authMiddleware, async (): Promise<any> => {
        const list = await EMAIL_STORE.list();
        const emails = [];
        for (const key of list.keys) {
            if (!key.name.startsWith('BLOCK_') && !key.name.startsWith('WHITE_') && !key.name.startsWith('TelegramID2MailID:')) {
                const cache = await dao.loadMailCache(key.name);
                if (cache)
                    emails.push(cache);
            }
        }
        return emails;
    });

    // Get Single Email
    router.get('/api/emails/:id', authMiddleware, async (req: IRequest): Promise<any> => {
        const id = req.params.id;
        const cache = await dao.loadMailCache(id);
        if (!cache) {
            return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
        }
        return cache;
    });

    // Delete Email
    router.delete('/api/emails/:id', authMiddleware, async (req: IRequest): Promise<any> => {
        const id = req.params.id;
        await EMAIL_STORE.delete(id);
        return { success: true };
    });

    // Send Email
    router.post('/api/emails/send', authMiddleware, async (req: IRequest): Promise<any> => {
        const body = await req.json() as any;
        if (!env.RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), { status: 500 });
        }
        await sendEmail(env.RESEND_API_KEY, 'noreply@engdawood.com', {
            to: body.to,
            subject: body.subject,
            body: body.body,
            attachments: body.attachments || [],
            inReplyTo: body.inReplyTo || null,
        });
        return { success: true };
    });

    // Settings
    router.get('/api/settings', authMiddleware, async (): Promise<any> => {
        const settingsRaw = await EMAIL_STORE.get('DASHBOARD_SETTINGS');
        return settingsRaw ? JSON.parse(settingsRaw) : {};
    });

    router.post('/api/settings', authMiddleware, async (req: IRequest): Promise<any> => {
        const body = await req.json();
        await EMAIL_STORE.put('DASHBOARD_SETTINGS', JSON.stringify(body));
        return { success: true };
    });
}
