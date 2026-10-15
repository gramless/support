import { t } from './i18n.js';

export function telegramId(value) {
  if (typeof value === 'string' && /^-?[1-9]\d*$/.test(value)) value = Number(value);
  // Bot API user/chat IDs have at most 52 significant bits. Reject rounded inputs.
  return Number.isSafeInteger(value) && value !== 0 && Math.abs(value) < 2 ** 52
    ? value
    : null;
}

export function threadId(value) {
  return Number.isSafeInteger(value) && value > 1 ? value : null;
}

function clean(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

export function profile(user) {
  return {
    first_name: clean(user.first_name),
    last_name: clean(user.last_name) || null,
    username: clean(user.username) || null,
    lang_code: clean(user.language_code) || null,
  };
}

export function topicTitle(row) {
  const suffix = ` · ${row.username ? '@' + row.username : row.tg_user_id}`;
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'User';
  // Count UTF-16 units conservatively without splitting a surrogate pair.
  let prefix = '';
  for (const character of name) {
    if (prefix.length + character.length + suffix.length > 128) break;
    prefix += character;
  }
  return prefix.trimEnd() + suffix;
}

function html(value) {
  return String(value ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function date(value) {
  return value == null ? '—' : new Date(value * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function contactInfo(row, detailed = true, language = 'en') {
  const fields = [
    [t(language, 'fullName'), [row.first_name, row.last_name].filter(Boolean).join(' ') || '—'],
    [t(language, 'username'), row.username ? '@' + row.username : '—'],
    [t(language, 'telegramId'), row.tg_user_id],
    [t(language, 'telegramLanguage'), row.lang_code],
    [t(language, 'firstContact'), date(row.created_at)],
    [t(language, 'status'), t(language, row.status === 'closed' ? 'closed' : 'open')],
  ];
  if (detailed) fields.push(
    [t(language, 'lastInbound'), date(row.last_in_at)],
    [t(language, 'lastOutbound'), date(row.last_out_at)],
    [t(language, 'bannedLabel'), t(language, row.banned ? 'yes' : 'no')],
    [t(language, 'silentLabel'), t(language, row.silent ? 'yes' : 'no')],
    [t(language, 'topicId'), row.message_thread_id],
    [t(language, 'languageLabel'), row.language],
    [t(language, 'botStatus'), row.bot_status],
  );
  return `<b>${t(language, 'contact')}</b>\n` + fields.map(([key, value]) => `<b>${key}:</b> ${html(value)}`).join('\n');
}

export function topicIntroduction(row, language = 'en') {
  const name = html([row.first_name, row.last_name].filter(Boolean).join(' ') || row.tg_user_id);
  const username = typeof row.username === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(row.username)
    ? row.username : null;
  const url = username ? `https://t.me/${username}` : `tg://user?id=${row.tg_user_id}`;
  const linkedName = `<b><a href="${url}">${name}</a></b>`;
  const metadata = [
    `${t(language, 'telegramId')}: <code>${html(row.tg_user_id)}</code>`,
    `${t(language, 'username')}: ${username ? '@' + html(username) : '—'}`,
    `${t(language, 'telegramLanguage')}: ${html(row.lang_code)}`,
    `${t(language, 'firstContact')}: ${date(row.created_at)}`,
    `${t(language, 'status')}: ${t(language, row.status === 'closed' ? 'closed' : 'open')}`,
  ];
  return t(language, 'started', { name: linkedName }) + '\n\n'
    + t(language, 'guidance') + '\n\n' + metadata.join('\n');
}

export function command(text) {
  if (typeof text !== 'string') return null;
  const match = /^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?(?=\s|$)/.exec(text);
  return match ? { name: match[1].toLowerCase(), target: match[2]?.toLowerCase() } : null;
}

export function hasContent(message) {
  return ['text', 'photo', 'video', 'document', 'audio', 'voice', 'animation',
    'sticker', 'video_note', 'contact', 'location', 'venue', 'poll', 'dice',
    'game', 'story', 'live_photo', 'checklist'].some(key => message[key] != null);
}
