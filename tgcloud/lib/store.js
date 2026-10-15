import { db } from 'sdk';
import { profile, telegramId } from './format.js';

export async function supportGroup() {
  const row = await db.get("SELECT value FROM support_config WHERE key = 'support_group_id'");
  const id = telegramId(row?.value);
  return id < 0 ? id : null;
}

export async function setting(key) {
  return (await db.get('SELECT value FROM support_config WHERE key = :key', { ':key': key }))?.value ?? null;
}

export async function rememberUser(id) {
  await db.run('INSERT INTO support_users (user_id) VALUES (:id) ON CONFLICT(user_id) DO NOTHING', { ':id': id });
  return preferences(id);
}

export function preferences(id) {
  return db.get('SELECT * FROM support_users WHERE user_id = :id', { ':id': id });
}

export function savePreference(id, field, value) {
  if (!['language', 'bot_status', 'menu_message_id', 'receipt_message_id'].includes(field)) throw new Error('Invalid preference');
  return db.run(`UPDATE support_users SET ${field} = :value WHERE user_id = :id`, { ':value': value, ':id': id });
}

export async function isOwner(id) {
  return telegramId(await setting('owner_id')) === id;
}

export function silentNotice(row, id) {
  return db.run('UPDATE support_conversations SET silent_notice_id = :notice WHERE id = :id', { ':notice': id, ':id': row.id });
}

export function byUser(id) {
  return db.get('SELECT * FROM support_conversations WHERE tg_user_id = :id', { ':id': id });
}

export async function byTopic(group, thread) {
  const rows = await db.all(`SELECT * FROM support_conversations
    WHERE topic_chat_id = :group AND message_thread_id = :thread LIMIT 2`,
  { ':group': group, ':thread': thread });
  return rows.length === 1 ? rows[0] : null;
}

export async function inbound(user, group) {
  const now = Math.floor(Date.now() / 1000);
  const info = profile(user);
  // A negative user ID reserves a unique non-routable thread until topic creation.
  // This preserves the deployed NOT NULL/UNIQUE schema without rebuilding it.
  await db.run(`INSERT INTO support_conversations
    (tg_user_id, topic_chat_id, message_thread_id, topic_title, first_name, last_name,
     username, lang_code, created_at, updated_at, last_in_at, status, banned, silent)
    VALUES (:id, :group, :pending, '', :first, :last, :username, :lang, :now, :now, :now, 'open', 0, 0)
    ON CONFLICT(tg_user_id) DO UPDATE SET first_name = excluded.first_name,
      last_name = excluded.last_name, username = excluded.username, lang_code = excluded.lang_code,
      updated_at = excluded.updated_at, last_in_at = MAX(COALESCE(last_in_at, 0), excluded.last_in_at)`,
  { ':id': user.id, ':group': group, ':pending': -user.id, ':first': info.first_name,
    ':last': info.last_name, ':username': info.username, ':lang': info.lang_code, ':now': now });
  return byUser(user.id);
}

export async function adoptTopic(row, thread, title, infoMessage) {
  const result = await db.run(`UPDATE support_conversations SET message_thread_id = :thread,
    topic_title = :title, topic_info_message_id = :info, silent_notice_id = NULL, status = 'open', updated_at = unixepoch()
    WHERE id = :id AND message_thread_id = :previous AND topic_chat_id = :group`,
  { ':thread': thread, ':title': title, ':info': infoMessage,
    ':id': row.id, ':previous': row.message_thread_id, ':group': row.topic_chat_id });
  return result.rowsAffected === 1;
}

export async function toggle(row, field) {
  if (!['banned', 'silent'].includes(field)) throw new Error('Invalid support flag');
  // The field is selected above, never supplied by Telegram input.
  await db.run(`UPDATE support_conversations SET ${field} = NOT COALESCE(${field}, 0),
    updated_at = unixepoch() WHERE id = :id`, { ':id': row.id });
  return byUser(row.tg_user_id);
}

export function setStatus(row, status) {
  if (!['open', 'closed'].includes(status)) throw new Error('Invalid conversation status');
  return db.run(`UPDATE support_conversations SET status = :status, updated_at = unixepoch()
    WHERE id = :id AND message_thread_id = :thread`,
  { ':status': status, ':id': row.id, ':thread': row.message_thread_id });
}

export function delivered(row) {
  return db.run(`UPDATE support_conversations SET last_out_at = unixepoch(), updated_at = unixepoch()
    WHERE id = :id`, { ':id': row.id });
}

export function saveTitle(row, title) {
  return db.run(`UPDATE support_conversations SET topic_title = :title, updated_at = unixepoch()
    WHERE id = :id AND message_thread_id = :thread`,
  { ':title': title, ':id': row.id, ':thread': row.message_thread_id });
}
