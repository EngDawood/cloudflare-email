import type * as Telegram from 'telegram-bot-api-types';
import type { Environment } from '../types';
import { Dao } from '../db';
import { sendEmail } from '../mail/resend';
import { createTelegramBotAPI } from './api';
import { clearDraft, getDraft, saveDraft } from './draft';

export async function handleFlow(message: Telegram.Message, env: Environment): Promise<boolean> {
    const chatId = message.chat.id;
    const text = message.text?.trim() || '';
    const token = env.TELEGRAM_TOKEN;
    const api = createTelegramBotAPI(token);
    const draft = await getDraft(env, chatId);

    // If there's an active draft and user types /cancel
    if (text.toLowerCase().startsWith('/cancel')) {
        if (draft) {
            await clearDraft(env, chatId);
            await api.sendMessage({ chat_id: chatId, text: '✅ Draft cancelled.' });
        } else {
            await api.sendMessage({ chat_id: chatId, text: 'No active draft to cancel.' });
        }
        return true;
    }

    // New Flow: /send
    if (text.toLowerCase().startsWith('/send')) {
        await clearDraft(env, chatId);
        await saveDraft(env, chatId, { type: 'send', step: 'send_to' });
        await api.sendMessage({
            chat_id: chatId,
            text: '📧 <b>New Email</b>\n\n<b>Step 1 / 3</b> — Enter recipient email:',
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancel draft', callback_data: 'cancel' }]],
            },
            parse_mode: 'HTML',
        });
        return true;
    }

    // New Flow: /forward <id>
    if (text.toLowerCase().startsWith('/forward')) {
        const match = text.match(/^\/forward(?:\s+(\S+))?/i);
        const id = match?.[1];
        if (!id) {
            await api.sendMessage({ chat_id: chatId, text: '❌ Usage: /forward <id>' });
            return true;
        }
        const dao = new Dao(env.DB);
        const email = await dao.loadMailCache(id);
        if (!email) {
            await api.sendMessage({ chat_id: chatId, text: `❌ No email found with ID: <code>${id}</code>`, parse_mode: 'HTML' });
            return true;
        }
        await clearDraft(env, chatId);
        await saveDraft(env, chatId, { type: 'forward', step: 'forward_to', emailId: id, email });
        await api.sendMessage({
            chat_id: chatId,
            text: `📨 <b>Forwarding #${id}</b>\n\n<b>From:</b> ${email.fromName || email.from}\n<b>Subject:</b> ${email.subject}\n\n✉️ <i>Enter the destination email address:</i>`,
            reply_markup: {
                inline_keyboard: [[{ text: '❌ Cancel draft', callback_data: 'cancel' }]],
            },
            parse_mode: 'HTML',
        });
        return true;
    }

    // Handle Active Draft Steps
    if (draft && text !== '') {
        switch (draft.step) {
            case 'send_to':
                draft.to = text;
                draft.step = 'send_subject';
                await saveDraft(env, chatId, draft);
                await api.sendMessage({
                    chat_id: chatId,
                    text: '<b>Step 2 / 3</b> — Enter subject:',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Cancel draft', callback_data: 'cancel' }]] },
                    parse_mode: 'HTML',
                });
                break;

            case 'send_subject':
                draft.subject = text;
                draft.step = 'send_body';
                await saveDraft(env, chatId, draft);
                await api.sendMessage({
                    chat_id: chatId,
                    text: '<b>Step 3 / 3</b> — Enter message body:',
                    reply_markup: { inline_keyboard: [[{ text: '❌ Cancel draft', callback_data: 'cancel' }]] },
                    parse_mode: 'HTML',
                });
                break;

            case 'send_body':
                draft.body = text;
                draft.step = 'preview';
                await saveDraft(env, chatId, draft);
                await api.sendMessage({
                    chat_id: chatId,
                    text: `📤 <b>Preview — New Email</b>\n\n<b>To:</b> ${draft.to}\n<b>Subject:</b> ${draft.subject}\n\n<code>────────────────────────────</code>\n${draft.body}\n<code>────────────────────────────</code>`,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Send', callback_data: 'confirm_send' }, { text: '❌ Cancel', callback_data: 'cancel' }],
                        ],
                    },
                    parse_mode: 'HTML',
                });
                break;

            case 'forward_to': {
                draft.to = text;
                draft.step = 'preview';
                await saveDraft(env, chatId, draft);

                const fwdBody = [
                    `---------- Forwarded message ----------`,
                    `From: ${draft.email.fromName ?? draft.email.from}`,
                    `Date: ${draft.email.date}`,
                    `Subject: ${draft.email.subject}`,
                    `To: ${draft.email.to}`,
                    ``,
                    draft.email.body ?? '',
                ].join('\n');
                draft.body = fwdBody;

                await api.sendMessage({
                    chat_id: chatId,
                    text: `📤 <b>Preview — Forward</b>\n\n<b>To:</b> ${draft.to}\n<b>Subject:</b> Fwd: ${draft.email.subject}\n\n<code>────────────────────────────</code>\n${fwdBody.substring(0, 500)}...\n<code>────────────────────────────</code>`,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Send', callback_data: 'confirm_send' }, { text: '❌ Cancel', callback_data: 'cancel' }],
                        ],
                    },
                    parse_mode: 'HTML',
                });
                break;
            }

            case 'preview':
                await api.sendMessage({
                    chat_id: chatId,
                    text: '⬆️ Use the buttons above to send or cancel.',
                });
                break;
        }
        return true;
    }

    return false;
}

export async function handleFlowCallback(callback: Telegram.CallbackQuery, env: Environment): Promise<boolean> {
    const data = callback.data;
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    const token = env.TELEGRAM_BOT_TOKEN;
    const api = createTelegramBotAPI(token);

    if (!data || !chatId || !messageId)
        return false;

    if (data === 'cancel') {
        await clearDraft(env, chatId);
        await api.editMessageText({
            chat_id: chatId,
            message_id: messageId,
            text: '❌ <i>Draft cancelled.</i>',
            parse_mode: 'HTML',
        });
        return true;
    }

    if (data === 'confirm_send') {
        const draft = await getDraft(env, chatId);
        if (!draft) {
            await api.editMessageText({
                chat_id: chatId,
                message_id: messageId,
                text: '❌ <i>This draft has expired.</i>',
                parse_mode: 'HTML',
            });
            return true;
        }

        try {
            if (draft.type === 'send') {
                await sendEmail(env.RESEND_API_KEY || '', 'noreply@engdawood.com', [draft.to || ''], draft.subject || '', draft.body || '');
                await api.editMessageText({
                    chat_id: chatId,
                    message_id: messageId,
                    text: `✅ <b>Email sent</b>\n<b>To:</b> ${draft.to}\n<b>Subject:</b> ${draft.subject}`,
                    parse_mode: 'HTML',
                });
            } else if (draft.type === 'forward') {
                await sendEmail(env.RESEND_API_KEY || '', 'noreply@engdawood.com', [draft.to || ''], `Fwd: ${draft.email.subject}`, draft.body || '');
                await api.editMessageText({
                    chat_id: chatId,
                    message_id: messageId,
                    text: `✅ <b>Email forwarded</b>\n<b>To:</b> ${draft.to}\n<b>Subject:</b> Fwd: ${draft.email.subject}`,
                    parse_mode: 'HTML',
                });
            }
            await clearDraft(env, chatId);
        } catch (e) {
            await api.sendMessage({ chat_id: chatId, text: `❌ Failed to send: ${(e as Error).message}` });
        }
        return true;
    }

    return false;
}
