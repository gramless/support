import { api, BotApiError, db } from 'sdk';
import * as store from '../lib/store.js';
import { telegramId, threadId } from '../lib/format.js';
import { locale, t } from '../lib/i18n.js';

export default async function (update) {
  const id = telegramId(update?.chat?.id);
  const next = update?.new_chat_member;
  const status = next?.status;
  if (!id || id <= 0 || update.chat.type !== 'private' || !next?.user?.is_bot
    || !['member', 'kicked'].includes(status)) return;
  await store.rememberUser(id);
  const result = await db.run('UPDATE support_users SET bot_status = :status WHERE user_id = :id AND bot_status != :status',
    { ':id': id, ':status': status });
  if (!result.rowsAffected) return;
  const row = await store.byUser(id);
  if (!row || row.status === 'closed' || !threadId(row.message_thread_id)
    || row.topic_chat_id !== await store.supportGroup()) return;
  const language = locale(await store.setting('staff_language'));
  try {
    await api.sendMessage({ chat_id: row.topic_chat_id, message_thread_id: row.message_thread_id,
      text: t(language, status === 'member' ? 'restarted' : 'stopped') });
  } catch (error) {
    if (!(error instanceof BotApiError) || error.code !== 400
      || !/message thread not found|topic_closed|topic_deleted/i.test(error.description || '')) throw error;
  }
}
