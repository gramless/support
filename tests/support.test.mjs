import { registerHooks } from 'node:module';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset, db, state, BotApiError } from './sdk.mjs';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'sdk') return { url: new URL('./sdk.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { default: handle } = await import('../tgcloud/handlers/message.js');
const { default: callback } = await import('../tgcloud/handlers/callback_query.js');
const { default: edited } = await import('../tgcloud/handlers/edited_message.js');
const { default: membership } = await import('../tgcloud/handlers/my_chat_member.js');
const { messages, privateCommands } = await import('../tgcloud/lib/i18n.js');
const { parseButtons } = await import('../tgcloud/lib/newsletter.js');
const { checkReleases } = await import('../tgcloud/lib/updates.js');
const { newerRelease } = await import('../tgcloud/lib/version.js');
const { byUser } = await import('../tgcloud/lib/store.js');
const { topicTitle, topicIntroduction, telegramId } = await import('../tgcloud/lib/format.js');
const GROUP = -1001234567890;
let messageId = 0;
const user = (id = 1001, extra = {}) => ({ message_id: ++messageId,
  chat: { id, type: 'private' }, from: { id, is_bot: false, first_name: 'Alex', ...extra }, text: 'Help' });
const operator = (thread, text = 'Hello', extra = {}) => ({ message_id: ++messageId,
  chat: { id: GROUP, type: 'supergroup' }, from: { id: 2001, is_bot: false },
  message_thread_id: thread, is_topic_message: true, text, ...extra });
const calls = method => state.calls.filter(call => call.method === method);
const copies = () => calls('copyMessage');
const fail = (method, code, description, when) => state.failures.push({ method, error: new BotApiError(code, description, method), when });
beforeEach(() => { reset(); messageId = 0; });

test('release notices remain link-only for owners and obsolete update callbacks do nothing', async () => {
  await db.run("INSERT INTO support_config(key,value) VALUES ('owner_id','2001')");
  await checkReleases('0.1.0');
  const notice = calls('sendMessage').at(-1).params;
  assert.deepEqual(notice.reply_markup.inline_keyboard, [[{
    text:'View release',url:'https://github.com/gramless/support/releases/tag/v0.2.0',
  }]]);
  const sent = calls('sendMessage').length;
  for (const data of ['update:v0.2.0','up:install:v0.2.0','upauth:obsolete','upsetup:connect']) {
    await callback({id:'obsolete',data,from:{id:2001,is_bot:false},
      message:{chat:{id:2001,type:'private'},message_id:99}});
  }
  assert.equal(calls('sendMessage').length,sent);
  assert.equal(copies().length,0);
  assert.ok(!privateCommands('en',true).some(command=>command.command==='updates'));
});

test('topic opening matches the reference layout with safe linked names and localized command blocks', () => {
  const row = { tg_user_id: 1001, first_name: '<Alex & Co>', username: 'alex',
    lang_code: 'en', created_at: 0, status: 'open' };
  const en = topicIntroduction(row);
  assert.ok(en.startsWith('User <b><a href="https://t.me/alex">&lt;Alex &amp; Co&gt;</a></b> started the bot!'));
  assert.ok(en.includes('List of available commands:\n\n• /ban\n'));
  assert.equal((en.match(/<blockquote>/g) || []).length, 3);
  for (const value of ['/silent', '/information', 'Telegram ID', 'First contact', 'Status']) assert.ok(en.includes(value));
  const ru = topicIntroduction({ ...row, username: null }, 'ru');
  assert.ok(ru.startsWith('Пользователь '));
  assert.ok(ru.includes('href="tg://user?id=1001"'));
  assert.ok(ru.includes('Список доступных команд:'));
  assert.ok(!topicIntroduction({ ...row, username: 'bad"onclick="x' }).includes('onclick'));
});

test('first inbound persists one conversation and initialized topic before copying', async () => {
  await handle(user());
  const row = await byUser(1001);
  assert.ok(row.message_thread_id > 1);
  assert.ok(row.topic_info_message_id > 0);
  assert.ok(row.last_in_at);
  assert.equal(copies()[0].params.message_thread_id, row.message_thread_id);
  assert.equal(calls('sendMessage').filter(call => call.params.chat_id === GROUP).length, 1);
  assert.match(calls('sendMessage')[0].params.text, /First contact/);
});

test('second inbound reuses the same conversation and topic', async () => {
  await handle(user()); const original = await byUser(1001);
  await handle(user()); const row = await byUser(1001);
  assert.equal(row.id, original.id);
  assert.equal(row.message_thread_id, original.message_thread_id);
  assert.equal(calls('createForumTopic').length, 1);
  assert.equal(copies().length, 2);
});

test('two users have distinct persisted mappings and topic replies reach the correct user', async () => {
  await handle(user(1001)); await handle(user(1002));
  const first = await byUser(1001); const second = await byUser(1002);
  assert.notEqual(first.message_thread_id, second.message_thread_id);
  await handle(operator(second.message_thread_id));
  assert.equal(copies().at(-1).params.chat_id, 1002);
  assert.ok((await byUser(1002)).last_out_at);
  assert.equal((await byUser(1001)).last_out_at, null);
});

test('unrelated groups, unmapped topics and General are ignored', async () => {
  await handle(user()); const row = await byUser(1001); state.calls.length = 0;
  await handle(operator(row.message_thread_id, 'stranger', { chat: { id: -100999, type: 'supergroup' } }));
  await handle(operator(999)); await handle(operator(1));
  await handle(operator(row.message_thread_id, 'not a topic', { is_topic_message: false }));
  assert.equal(state.calls.length, 0);
});

test('/start including deep links is handled without creating a conversation', async () => {
  await handle({ ...user(), text: '/start referral' });
  await handle({ ...user(), text: '/start@support_bot' });
  assert.equal(await byUser(1001), null);
  assert.equal(copies().length, 0);
  assert.equal(calls('sendMessage').length, 1);
  assert.equal(calls('editMessageText').length, 1);
});

test('/info stays in the topic and escapes profile HTML', async () => {
  await handle(user(1001, { first_name: '<Alex & Co>' }));
  const row = await byUser(1001); const count = copies().length;
  await handle(operator(row.message_thread_id, '/info'));
  assert.equal(copies().length, count);
  const text = calls('sendMessage').at(-1).params.text;
  for (const label of ['Full name', 'Username', 'Telegram ID', 'Language', 'First contact', 'Last inbound', 'Last outbound', 'Banned', 'Silent', 'Status', 'Topic ID']) assert.ok(text.includes(label));
  assert.ok(text.includes('&lt;Alex &amp; Co&gt;'));
});

test('/ban persists, blocks inbound and can be toggled back while banned', async () => {
  await handle(user()); const row = await byUser(1001);
  await handle(operator(row.message_thread_id, '/ban'));
  assert.equal((await byUser(1001)).banned, 1);
  await handle(user()); assert.equal(copies().length, 1);
  await handle(operator(row.message_thread_id, '/ban'));
  await handle(user()); assert.equal(copies().length, 2);
  assert.equal((await byUser(1001)).banned, 0);
});

test('/silent suppresses only outbound and persists until toggled off', async () => {
  await handle(user()); const row = await byUser(1001);
  await handle(operator(row.message_thread_id, '/silent'));
  assert.equal((await byUser(1001)).silent, 1);
  await handle(operator(row.message_thread_id)); assert.equal(copies().length, 1);
  await handle(user()); assert.equal(copies().length, 2);
  await handle(operator(row.message_thread_id, '/silent'));
  await handle(operator(row.message_thread_id)); assert.equal(copies().length, 3);
  assert.equal((await byUser(1001)).silent, 0);
});

test('/close and the next inbound reopen the same topic and row', async () => {
  await handle(user()); const row = await byUser(1001);
  await handle(operator(row.message_thread_id, '/close'));
  assert.equal((await byUser(1001)).status, 'closed');
  await handle(user()); const resumed = await byUser(1001);
  assert.equal(resumed.id, row.id); assert.equal(resumed.message_thread_id, row.message_thread_id);
  assert.equal(resumed.status, 'open'); assert.equal(calls('reopenForumTopic').length, 1);
  assert.equal(calls('createForumTopic').length, 1);
});

test('username fallback, safe ID range, and topic title limits', async () => {
  await handle(user(2 ** 51, { first_name: '😀'.repeat(128) }));
  const row = await byUser(2 ** 51);
  assert.ok(topicTitle(row).length <= 128);
  assert.ok(topicTitle(row).endsWith(' · ' + 2 ** 51));
  assert.equal(telegramId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(telegramId('9007199254740993'), null);
  assert.equal(telegramId('-1001234567890'), GROUP);
});

test('metadata refresh also clears removed username and last name', async () => {
  await handle(user(1001, { first_name: 'Old', last_name: 'Name', username: 'old', language_code: 'en' }));
  await handle(user(1001, { first_name: 'New', language_code: 'fr' }));
  const row = await byUser(1001);
  assert.equal(row.first_name, 'New'); assert.equal(row.last_name, null);
  assert.equal(row.username, null); assert.equal(row.lang_code, 'fr');
  assert.equal(row.topic_title, 'New · 1001');
  assert.equal(calls('editForumTopic').length, 1);
});

test('deleted topic is replaced and current content retried once', async () => {
  await handle(user()); const original = await byUser(1001);
  state.topics.delete(original.message_thread_id);
  await handle(user()); const row = await byUser(1001);
  assert.equal(row.id, original.id); assert.notEqual(row.message_thread_id, original.message_thread_id);
  assert.equal(calls('createForumTopic').length, 2);
  assert.equal(copies().at(-1).params.message_thread_id, row.message_thread_id);
  assert.equal(copies().length, 3);
});

test('concurrent first contact adopts one topic, deletes loser, delivers both messages', async () => {
  await Promise.all([handle(user()), handle(user())]);
  assert.equal((await db.get('SELECT count(*) AS n FROM support_conversations')).n, 1);
  assert.equal(state.topics.size, 1); assert.equal(copies().length, 2);
  assert.equal(copies()[0].params.message_thread_id, copies()[1].params.message_thread_id);
});

test('concurrent missing-topic recovery adopts exactly one replacement', async () => {
  await handle(user()); const row = await byUser(1001);
  state.topics.delete(row.message_thread_id);
  await Promise.all([handle(user()), handle(user())]);
  assert.equal(state.topics.size, 1);
  assert.equal(copies().at(-1).params.message_thread_id, (await byUser(1001)).message_thread_id);
});

test('bot, anonymous admin and service messages never loop or relay', async () => {
  await handle({ ...user(), from: { id: 1001, is_bot: true } });
  await handle({ ...operator(10), sender_chat: { id: GROUP } });
  const service = user(); delete service.text; service.forum_topic_created = { name: 'Test' };
  await handle(service);
  assert.equal(state.calls.length, 0);
});

test('blocked-user failure preserves mapping and last successful outbound', async () => {
  await handle(user()); const original = await byUser(1001);
  fail('copyMessage', 403, 'Forbidden: bot was blocked by the user');
  await handle(operator(original.message_thread_id));
  const row = await byUser(1001);
  assert.equal(row.message_thread_id, original.message_thread_id); assert.equal(row.last_out_at, null);
  assert.match(calls('sendMessage').at(-1).params.text, /not delivered/);
});

test('transient Telegram failure propagates without replacing mapping', async () => {
  await handle(user()); const row = await byUser(1001);
  fail('copyMessage', 429, 'Too Many Requests: retry after 1');
  await assert.rejects(handle(user()), error => error.code === 429);
  assert.equal((await byUser(1001)).message_thread_id, row.message_thread_id);
  assert.equal(calls('createForumTopic').length, 1);
});

test('permission failure does not masquerade as deleted topic', async () => {
  await handle(user()); const row = await byUser(1001);
  fail('copyMessage', 403, 'Forbidden: not enough rights to send a message to forum topic');
  await handle(user());
  assert.equal(calls('createForumTopic').length, 1);
  assert.equal((await byUser(1001)).message_thread_id, row.message_thread_id);
});

test('edits only send a private correction notice and never relay edited content', async () => {
  await edited(user());
  await edited(operator(10));
  await handle(user(), { update: { edited_message: user() } });
  assert.equal(copies().length, 0); assert.equal(await byUser(1001), null);
});

test('native copies preserve media, captions and entities without reconstruction', async () => {
  for (const type of ['photo', 'video', 'document', 'audio', 'voice', 'animation', 'sticker', 'video_note', 'contact', 'location', 'poll']) {
    const message = user(); delete message.text;
    message[type] = { file_id: 'telegram-file' }; message.caption = 'Caption'; message.caption_entities = [];
    message.media_group_id = 'album';
    await handle(message);
  }
  const row = await byUser(1001);
  await handle(operator(row.message_thread_id, undefined, { text: undefined, photo: [{ file_id: 'photo' }] }));
  assert.equal(copies().length, 12); assert.equal(calls('createForumTopic').length, 1);
});

test('staff membership and admin commands are authorized; unknown commands stay internal', async () => {
  await handle(user()); const row = await byUser(1001);
  state.member = 'member';
  await handle(operator(row.message_thread_id, '/ban'));
  assert.equal((await byUser(1001)).banned, 0);
  await handle(operator(row.message_thread_id, '/unknown'));
  await handle(operator(row.message_thread_id, '/ban@other_bot'));
  assert.equal(copies().length, 1);
  state.member = 'left';
  await handle(operator(row.message_thread_id)); assert.equal(copies().length, 1);
});

test('a manually closed topic is reopened after copy reports TOPIC_CLOSED', async () => {
  await handle(user()); const row = await byUser(1001); state.closed.add(row.message_thread_id);
  await handle(user());
  assert.equal(calls('reopenForumTopic').length, 1); assert.equal(calls('createForumTopic').length, 1);
});

test('uncopyable content gets feedback and an unexpected 400 propagates', async () => {
  await handle(user());
  fail('copyMessage', 400, "Bad Request: message can't be copied"); await handle(user());
  assert.match(calls('sendMessage').at(-1).params.text, /could not be copied/);
  fail('copyMessage', 400, 'Bad Request: invalid unexpected parameter');
  await assert.rejects(handle(user()), error => error.code === 400);
  assert.equal(calls('createForumTopic').length, 1);
});

async function tap(id, data, extra = {}) {
  const preferences = await db.get('SELECT * FROM support_users WHERE user_id = :id', { ':id': id });
  return callback({ id: 'callback-' + ++messageId, from: { id, is_bot: false, language_code: 'en' }, data,
    message: { message_id: preferences?.menu_message_id || 1, chat: { id, type: 'private' } }, ...extra });
}

async function ownerSetup() {
  await db.run("INSERT INTO support_config (key, value) VALUES ('owner_id', '9001')");
  await handle({ ...user(9001), text: '/newsletter' });
  await tap(9001, 'nl:new');
  await handle({ ...user(9001), text: 'A newsletter', photo: [{ file_id: 'newsletter-photo' }], caption: 'A caption' });
  await handle({ ...user(9001), text: '/skip' });
  return db.get('SELECT * FROM support_newsletters WHERE owner_id = 9001');
}

test('language picker persists selection across invocations and Telegram profile changes', async () => {
  await handle({ ...user(1001), text: '/start' });
  assert.equal(calls('sendMessage').at(-1).params.reply_markup.inline_keyboard[0].length, 2);
  await tap(1001, 'language:ru');
  assert.equal((await db.get('SELECT language FROM support_users WHERE user_id = 1001')).language, 'ru');
  await handle({ ...user(1001, { language_code: 'en' }), text: '/start' });
  assert.match(calls('editMessageText').at(-1).params.text, /Напишите/);
  await handle(user(1001, { language_code: 'en' }));
  assert.match(calls('sendMessage').at(-1).params.text, /Сообщение отправлено/);
  await handle({ ...user(1001), text: '/language' });
  await tap(1001, 'language:en');
  assert.match(calls('editMessageText').at(-1).params.text, /Send your question/);
});

test('callbacks acknowledge first and reject forged, stale, invalid and group language choices', async () => {
  await handle({ ...user(), text: '/language' });
  const start = state.calls.length;
  await tap(1001, 'language:xx');
  await tap(1002, 'language:ru', { message: { message_id: 1, chat: { id: 1001, type: 'private' } } });
  await tap(1001, 'language:ru', { message: { message_id: 9999, chat: { id: 1001, type: 'private' } } });
  await tap(1001, 'language:ru', { message: { message_id: 1, chat: { id: GROUP, type: 'supergroup' } } });
  assert.equal(state.calls[start].method, 'answerCallbackQuery');
  assert.equal(calls('answerCallbackQuery').length, 4);
  assert.equal((await db.get('SELECT language FROM support_users WHERE user_id = 1001')).language, null);
});

test('both locales cover every text and source/id/information commands stay internal', async () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ru).sort());
  await handle({ ...user(), text: '/source' });
  assert.match(calls('sendMessage').at(-1).params.text, /nessshon\/support-bot/);
  assert.equal(copies().length, 0);
  await handle(operator(1, '/id'));
  assert.equal(calls('sendMessage').at(-1).params.text, String(GROUP));
  await handle(user()); const row = await byUser(1001); const count = copies().length;
  await handle(operator(row.message_thread_id, '/information'));
  assert.equal(copies().length, count);
  assert.match(calls('sendMessage').at(-1).params.text, /Support contact/);
});

test('bot blocked/unblocked state persists and duplicate status events do not spam topics', async () => {
  await handle(user()); const count = calls('sendMessage').length;
  const update = { chat: { id: 1001, type: 'private' }, new_chat_member: { user: { id: 123, is_bot: true }, status: 'kicked' } };
  await membership(update); await membership(update);
  assert.equal(calls('sendMessage').length, count + 1);
  assert.equal((await db.get('SELECT bot_status FROM support_users WHERE user_id = 1001')).bot_status, 'kicked');
  await membership({ ...update, new_chat_member: { ...update.new_chat_member, status: 'member' } });
  assert.match(calls('sendMessage').at(-1).params.text, /restarted/);
});

test('newsletter authorization and HTTPS URL-button validation', async () => {
  await handle({ ...user(), text: '/newsletter' });
  assert.match(calls('sendMessage').at(-1).params.text, /configured bot owner/);
  await tap(1001, 'nl:new');
  assert.equal((await db.get('SELECT count(*) AS n FROM support_newsletters')).n, 0);
  assert.equal(parseButtons('Read | javascript:alert(1)'), null);
  assert.equal(parseButtons('Read | https://user:password@example.com'), null);
  assert.deepEqual(parseButtons('Read | https://example.com/docs'), [[{ text: 'Read', url: 'https://example.com/docs' }]]);
});

test('newsletter compose/preview never relays to support and sends only after confirmation', async () => {
  await handle({ ...user(1001), text: '/start' });
  const row = await ownerSetup();
  assert.equal(row.state, 'preview');
  assert.equal(copies().filter(call => call.params.chat_id !== 9001).length, 0);
  assert.equal(await byUser(9001), null);
  await tap(9001, `nl:send:${row.id}`);
  assert.equal(copies().at(-1).params.chat_id, 1001);
  assert.equal((await db.get('SELECT state FROM support_newsletters WHERE id = :id', { ':id': row.id })).state, 'complete');
  const count = copies().length;
  await tap(9001, `nl:send:${row.id}`);
  assert.equal(copies().length, count);
});

test('newsletter snapshots recipients, excludes banned/blocked users and resumes bounded batches', async () => {
  for (let id = 1001; id <= 1009; id++) await handle({ ...user(id), text: '/start' });
  await handle(user(1001)); const conversation = await byUser(1001);
  await handle(operator(conversation.message_thread_id, '/ban'));
  await db.run("UPDATE support_users SET bot_status = 'kicked' WHERE user_id = 1002");
  const row = await ownerSetup();
  await Promise.all([tap(9001, `nl:send:${row.id}`), tap(9001, `nl:send:${row.id}`)]);
  let sent = copies().filter(call => call.params.from_chat_id === 9001 && call.params.chat_id !== 9001);
  assert.equal(sent.length, 5);
  await handle({ ...user(1010), text: '/start' });
  await tap(9001, `nl:send:${row.id}`);
  sent = copies().filter(call => call.params.from_chat_id === 9001 && call.params.chat_id !== 9001);
  assert.equal(sent.length, 7);
  assert.equal(new Set(sent.map(call => call.params.chat_id)).size, 7);
  assert.ok(sent.every(call => ![1001, 1002, 1010].includes(call.params.chat_id)));
});

test('newsletter rate limit is persisted and retry does not advance the recipient', async () => {
  await handle({ ...user(1001), text: '/start' }); const row = await ownerSetup();
  const error = new BotApiError(429, 'Too many requests', 'copyMessage'); error.parameters = { retry_after: 30 };
  state.failures.push({ method: 'copyMessage', when: params => params.chat_id === 1001, error });
  await tap(9001, `nl:send:${row.id}`);
  const recipient = await db.get('SELECT state FROM support_newsletter_recipients WHERE newsletter_id = :id', { ':id': row.id });
  assert.equal(recipient.state, 'pending');
  const count = copies().length; await tap(9001, `nl:send:${row.id}`); assert.equal(copies().length, count);
  assert.match(calls('editMessageText').at(-1).params.text, /rate limit/);
});

test('newsletter ambiguous transport failures are recorded without automatic duplicate sends', async () => {
  await handle({ ...user(1001), text: '/start' }); const row = await ownerSetup();
  fail('copyMessage', 500, 'Server unavailable', params => params.chat_id === 1001);
  await tap(9001, `nl:send:${row.id}`);
  assert.equal((await db.get('SELECT state FROM support_newsletter_recipients WHERE newsletter_id = :id', { ':id': row.id })).state, 'uncertain');
  const count = copies().length; await tap(9001, `nl:send:${row.id}`); assert.equal(copies().length, count);
});

test('newsletter due times, cancellation and draft state persist between messages', async () => {
  const row = await ownerSetup(); await tap(9001, `nl:date:${row.id}`);
  const future = new Date(Date.now() + 3600000).toISOString().slice(0, 16).replace('T', ' ');
  await handle({ ...user(9001), text: future });
  const saved = await db.get('SELECT * FROM support_newsletters WHERE id = :id', { ':id': row.id });
  assert.ok(saved.not_before > Date.now() / 1000);
  const count = copies().length; await tap(9001, `nl:send:${row.id}`); assert.equal(copies().length, count);
  assert.match(calls('editMessageText').at(-1).params.text, /not due/);
  await tap(9001, `nl:cancel:${row.id}`);
  assert.equal((await db.get('SELECT state FROM support_newsletters WHERE id = :id', { ':id': row.id })).state, 'cancelled');
});

test('newsletter link buttons survive native preview and delivery', async () => {
  await db.run("INSERT INTO support_config (key, value) VALUES ('owner_id', '9001')");
  await handle({ ...user(1001), text: '/start' });
  await handle({ ...user(9001), text: '/newsletter' }); await tap(9001, 'nl:new');
  await handle({ ...user(9001), text: 'Newsletter' });
  await handle({ ...user(9001), text: 'Read | https://example.com' });
  const row = await db.get('SELECT * FROM support_newsletters');
  await tap(9001, `nl:send:${row.id}`);
  assert.equal(copies().at(-1).params.reply_markup.inline_keyboard[0][0].url, 'https://example.com');
});

test('metadata and silent notices pin only when allowed and disabling silent unpins its own notice', async () => {
  state.canPin = true;
  await handle(user()); const row = await byUser(1001);
  assert.equal(calls('pinChatMessage').length, 1);
  await handle(operator(row.message_thread_id, '/silent'));
  const silent = await byUser(1001); assert.ok(silent.silent_notice_id > 0);
  await handle(operator(row.message_thread_id, '/silent'));
  assert.equal(calls('unpinChatMessage').at(-1).params.message_id, silent.silent_notice_id);
  assert.equal((await byUser(1001)).silent_notice_id, null);
});

test('topic lifecycle events preserve native notices and never send confirmations', async () => {
  await handle(user()); const row = await byUser(1001); const count = copies().length;
  const service = operator(row.message_thread_id); delete service.text;
  await handle({ ...service, forum_topic_closed: {} });
  assert.equal((await byUser(1001)).status, 'closed');
  await handle({ ...service, forum_topic_reopened: {} });
  assert.equal((await byUser(1001)).status, 'open');
  assert.equal(calls('deleteMessage').length, 0); assert.equal(copies().length, count);
  await handle({ ...service, from: { id: 123, is_bot: true }, forum_topic_closed: {} });
  assert.equal((await byUser(1001)).status, 'open');
  await handle({ ...service, message_thread_id: 999, pinned_message: {} });
  assert.equal(calls('deleteMessage').length, 0);
  await handle({ ...service, pinned_message: {} });
  assert.equal(calls('deleteMessage').length, 1);
});

test('closing produces no topic confirmation and stays closed through lifecycle and availability events', async () => {
  await handle(user()); const row = await byUser(1001);
  state.calls.length = 0;
  await handle(operator(row.message_thread_id, '/close'));
  assert.deepEqual(state.calls.map(call => call.method), ['getChatMember', 'getChatMember', 'closeForumTopic']);
  assert.equal((await byUser(1001)).status, 'closed');
  assert.ok(state.closed.has(row.message_thread_id));
  const service = operator(row.message_thread_id); delete service.text;
  await handle({ ...service, forum_topic_closed: {} });
  await handle({ ...service, from: { id: 123, is_bot: true }, forum_topic_closed: {} });
  await membership({ chat: { id: 1001, type: 'private' },
    new_chat_member: { user: { id: 123, is_bot: true }, status: 'kicked' } });
  await membership({ chat: { id: 1001, type: 'private' },
    new_chat_member: { user: { id: 123, is_bot: true }, status: 'member' } });
  assert.equal(calls('sendMessage').length, 0);
  assert.equal(calls('deleteMessage').length, 0);
  assert.equal(calls('reopenForumTopic').length, 0);
  assert.equal((await byUser(1001)).status, 'closed');
  await handle(user());
  assert.equal(calls('reopenForumTopic').length, 1);
  assert.equal((await byUser(1001)).status, 'open');
});

test('newsletter lease recovery marks interrupted deliveries uncertain instead of resending', async () => {
  await handle({ ...user(1001), text: '/start' }); const row = await ownerSetup();
  await db.run("UPDATE support_newsletters SET state = 'sending', lease_token = 'expired', lease_until = 1 WHERE id = :id", { ':id': row.id });
  await db.run("INSERT INTO support_newsletter_recipients (newsletter_id, user_id, state) VALUES (:id, 1001, 'sending')", { ':id': row.id });
  const count = copies().length; await tap(9001, `nl:send:${row.id}`);
  assert.equal(copies().length, count);
  assert.equal((await db.get('SELECT state FROM support_newsletter_recipients WHERE newsletter_id = :id', { ':id': row.id })).state, 'uncertain');
});

test('newsletter missing source stops the batch with failures instead of pretending delivery', async () => {
  for (const id of [1001, 1002]) await handle({ ...user(id), text: '/start' });
  const row = await ownerSetup();
  fail('copyMessage', 400, 'Bad Request: message to copy not found', params => params.chat_id !== 9001);
  await tap(9001, `nl:send:${row.id}`);
  assert.equal((await db.get("SELECT count(*) AS n FROM support_newsletter_recipients WHERE state = 'failed'")).n, 2);
  assert.equal(copies().filter(call => call.params.from_chat_id === 9001 && call.params.chat_id !== 9001).length, 1);
});

test('release checks compare numeric stable versions and ignore missing/current/prerelease releases', async () => {
  assert.equal(newerRelease('v0.10.0', '0.9.9'), true);
  assert.equal(newerRelease('v0.1.0', '0.1.0'), false);
  assert.equal(newerRelease('v0.2.0-rc.1', '0.1.0'), false);
  state.releaseStatus = 404;
  assert.equal((await checkReleases('0.1.0')).reason, 'no-releases');
  state.releaseStatus = 200; state.release.tag_name = 'v0.1.0';
  assert.equal((await checkReleases('0.1.0')).reason, 'up-to-date');
  state.release = { tag_name: 'v1.0.0', prerelease: true };
  assert.equal((await checkReleases('0.1.0')).reason, 'not-a-stable-release');
  assert.equal(state.calls.length, 0);
});

test('new releases create a separate updates topic, deduplicate and reuse it for later versions', async () => {
  assert.equal((await checkReleases('0.1.0')).notified, true);
  const first = calls('sendMessage')[0].params;
  assert.match(first.text, /v0.2.0/); assert.match(first.text, /0.1.0/);
  assert.equal(first.reply_markup.inline_keyboard[0][0].url, 'https://github.com/gramless/support/releases/tag/v0.2.0');
  assert.equal((await db.get('SELECT count(*) AS n FROM support_conversations')).n, 0);
  assert.equal((await checkReleases('0.1.0')).reason, 'already-notified');
  assert.equal(calls('sendMessage').length, 1);
  state.release.tag_name = 'v0.3.0'; await checkReleases('0.1.0');
  assert.equal(calls('createForumTopic').length, 1);
  assert.equal(calls('sendMessage').at(-1).params.message_thread_id, first.message_thread_id);
});

test('concurrent release checks announce once and recover a deleted or closed updates topic', async () => {
  await Promise.all([checkReleases('0.1.0'), checkReleases('0.1.0')]);
  assert.equal(calls('sendMessage').length, 1);
  const thread = calls('sendMessage')[0].params.message_thread_id;
  state.topics.delete(thread); state.release.tag_name = 'v0.3.0';
  await checkReleases('0.1.0');
  assert.equal(calls('createForumTopic').length, 2);
  const replacement = calls('sendMessage').at(-1).params.message_thread_id;
  state.closed.add(replacement); state.release.tag_name = 'v0.4.0';
  await checkReleases('0.1.0');
  assert.equal(calls('reopenForumTopic').length, 1);
});

test('release HTTP/Telegram failures are visible and do not mark the release notified', async () => {
  state.releaseStatus = 503;
  await assert.rejects(checkReleases('0.1.0'), /HTTP 503/);
  assert.equal(state.calls.length, 0);
  state.releaseStatus = 200;
  fail('sendMessage', 403, 'Forbidden: not enough rights');
  await assert.rejects(checkReleases('0.1.0'), error => error.code === 403);
  assert.equal(await db.get("SELECT value FROM support_config WHERE key = 'release_notified'"), null);
  assert.equal((await db.get("SELECT value FROM support_config WHERE key = 'release_check_lock'")).value, '');
  assert.equal((await checkReleases('0.1.0')).notified, true);
});
