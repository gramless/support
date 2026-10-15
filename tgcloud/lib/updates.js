import { api, db, fetch, BotApiError } from 'sdk';
import * as store from './store.js';
import { telegramId, threadId } from './format.js';
import { locale, t } from './i18n.js';
import { releaseVersion, newerRelease } from './version.js';

async function save(key, value) {
  await db.run(`INSERT INTO support_config (key, value, updated_at) VALUES (:key, :value, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  { ':key': key, ':value': value });
}

async function savedObject(key) {
  const value = await store.setting(key);
  if (!value) return null;
  try { return JSON.parse(value); }
  catch { throw new Error('Invalid saved release-check state'); }
}

function topicFailure(error, pattern) {
  return error instanceof BotApiError && error.code === 400 && pattern.test(error.description || '');
}

async function createTopic(group, language) {
  const topic = await api.createForumTopic({ chat_id: group, name: t(language, 'updatesTopic') });
  if (!threadId(topic.message_thread_id)) throw new Error('Telegram returned an invalid updates topic ID');
  await save('release_topic', JSON.stringify({ group, thread: topic.message_thread_id }));
  return topic.message_thread_id;
}

export async function checkReleases(installedVersion) {
  if (!releaseVersion(installedVersion)) throw new Error('A valid deployed bot version is required');
  const response = await fetch('https://api.github.com/repos/gramless/support/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Gramless-Support' },
  });
  if (response.status === 404) return { checked: true, reason: 'no-releases' };
  if (!response.ok) throw new Error(`GitHub release check failed (HTTP ${response.status})`);
  const release = await response.json();
  if (release.draft || release.prerelease || !releaseVersion(release.tag_name)) {
    return { checked: true, reason: 'not-a-stable-release' };
  }
  if (!newerRelease(release.tag_name, installedVersion)) return { checked: true, reason: 'up-to-date', installedVersion };
  const group = await store.supportGroup();
  if (!group) throw new Error('Configure the support group before enabling release notifications');
  const token = crypto.randomUUID();
  const claim = await db.run(`INSERT INTO support_config (key, value, updated_at)
    VALUES ('release_check_lock', :token, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    WHERE support_config.value = '' OR support_config.updated_at < unixepoch() - 300`, { ':token': token });
  if (!claim.rowsAffected) return { checked: true, reason: 'another-check-running' };
  try {
    const notified = await savedObject('release_notified');
    if (notified?.group === group && releaseVersion(notified.version)
      && !newerRelease(release.tag_name, notified.version)) return { checked: true, reason: 'already-notified' };
    const language = locale(await store.setting('staff_language'));
    const saved = await savedObject('release_topic');
    let thread = saved?.group === group && telegramId(saved.group) && threadId(saved.thread);
    if (!thread) thread = await createTopic(group, language);
    const url = 'https://github.com/gramless/support/releases/tag/' + encodeURIComponent(release.tag_name);
    const params = { chat_id: group, text: t(language, 'updateAvailable', {
      version: release.tag_name, installed: installedVersion,
    }), reply_markup: { inline_keyboard: [[{ text: t(language, 'viewRelease'), url }]] } };
    if (await store.setting('owner_id')) {
      params.reply_markup.inline_keyboard.push([{ text: t(language, 'updateBot'),
        callback_data: 'update:' + release.tag_name }]);
    }
    let message;
    try {
      message = await api.sendMessage({ ...params, message_thread_id: thread });
    } catch (error) {
      if (topicFailure(error, /message thread not found|forum topic not found|topic_deleted|topic_id_invalid|message_thread_invalid/i)) {
        thread = await createTopic(group, language);
      } else if (topicFailure(error, /topic_closed|topic is closed/i)) {
        await api.reopenForumTopic({ chat_id: group, message_thread_id: thread });
      } else throw error;
      message = await api.sendMessage({ ...params, message_thread_id: thread });
    }
    // Record only an acknowledged send; permission/HTTP failures never mark a release sent.
    await save('release_notified', JSON.stringify({ group, version: release.tag_name,
      installed: installedVersion, message: message.message_id }));
    return { checked: true, notified: true, version: release.tag_name, installedVersion };
  } finally {
    await db.run("UPDATE support_config SET value = '', updated_at = unixepoch() WHERE key = 'release_check_lock' AND value = :token", { ':token': token });
  }
}
