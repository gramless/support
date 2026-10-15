import { api, db, fetch, BotApiError } from 'sdk';
import * as store from './store.js';
import { locale, t } from './i18n.js';
import { releaseVersion } from './version.js';
import { githubToken, connectGithub, authCallback, saveUpdateSetting } from './github-auth.js';

const repositoryPattern = /^[\w-]+\/[\w.-]+$/;

export async function updatesCommand(message) {
  if (!await store.isOwner(message.from.id)) return;
  const language = locale((await store.preferences(message.from.id))?.language || message.from.language_code);
  const repository = message.text.trim().split(/\s+/)[1];
  if (repository) {
    if (!repositoryPattern.test(repository)) return api.sendMessage({ chat_id: message.from.id, text: t(language, 'updatesRepositoryMissing') });
    if (repository !== await store.setting('update_repository')) {
      await saveUpdateSetting('update_repository', repository);
      await db.run("DELETE FROM support_config WHERE key IN ('update_auth', 'update_device')");
    }
  }
  return api.sendMessage({ chat_id: message.from.id, text: t(language, 'updatesSetup', {
    repository: await store.setting('update_repository') || 'owner/repository',
  }) });
}

export async function updateCallback(call) {
  if (typeof call?.data !== 'string' || !/^(update:|up:|upauth:)/.test(call.data)) return false;
  const language = locale((await store.preferences(call.from.id))?.language || call.from.language_code);
  const answer = key => api.answerCallbackQuery({ callback_query_id: call.id,
    text: t(language, key), show_alert: true });
  if (!await store.isOwner(call.from.id)) { await answer('updateDenied'); return true; }
  if (call.data.startsWith('upauth:')) {
    await api.answerCallbackQuery({ callback_query_id: call.id });
    const result = await authCallback(call, language);
    if (result !== 'githubConnected') await api.sendMessage({ chat_id: call.from.id, text: t(language, result) });
    return true;
  }
  const group = await store.supportGroup();
  const topic = JSON.parse(await store.setting('release_topic') || 'null');
  const notice = JSON.parse(await store.setting('release_notified') || 'null');
  const parts = call.data.split(':');
  const action = parts[0] === 'update' ? 'help' : parts[1];
  const tag = parts[0] === 'update' ? parts[1] : parts[2];
  if (call.message?.chat?.id !== group || topic?.group !== group
    || call.message?.message_thread_id !== topic?.thread || notice?.message !== call.message?.message_id
    || notice?.version !== tag || !releaseVersion(tag)
    || !['help', 'home', 'phone', 'cli', 'connect', 'install'].includes(action)) {
    await answer('updateDenied'); return true;
  }
  await api.answerCallbackQuery({ callback_query_id: call.id });
  const repository = await store.setting('update_repository');
  const validRepository = repositoryPattern.test(repository || '');
  const releaseUrl = 'https://github.com/gramless/support/releases/tag/' + encodeURIComponent(tag);
  const button = (key, target) => ({ text: t(language, key), callback_data: 'up:' + target + ':' + tag });
  const back = [button('updateBack', 'help')];
  async function edit(key, rows) {
    try {
      await api.editMessageText({ chat_id: group, message_id: call.message.message_id,
        text: t(language, key, { version: tag, installed: notice.installed || '?', repository: repository || 'owner/repository' }),
        reply_markup: { inline_keyboard: rows } });
    } catch (error) {
      if (!(error instanceof BotApiError && error.code === 400 && /message is not modified/i.test(error.description))) throw error;
    }
  }
  if (action === 'home') {
    await edit('updateAvailable', [[{ text: t(language, 'viewRelease'), url: releaseUrl }], [button('updateBot', 'help')]]);
  } else if (action === 'help') {
    await edit('updateOptions', [[button('updatePhone', 'phone')], [button('updateCli', 'cli')], [button('updateBack', 'home')]]);
  } else if (action === 'cli') {
    await edit('updateCliInstructions', [back]);
  } else if (action === 'connect') {
    const result = await connectGithub(call.from.id, language);
    await edit(result, [[button('updatePhone', 'phone')], back]);
  } else if (action === 'phone') {
    const rows = [[{ text: t(language, 'githubInstall'), url: 'https://github.com/apps/gramless-updates/installations/new' }],
      [button('githubConnect', 'connect')]];
    if (validRepository && await githubToken(call.from.id, repository)) rows.push([button('updateInstall', 'install')]);
    if (validRepository) rows.push([{ text: t(language, 'githubWorkflow'), url: `https://github.com/${repository}/actions/workflows/update-bot.yml` }]);
    rows.push(back);
    await edit('updatePhoneInstructions', rows);
  } else if (action === 'install') {
    const token = validRepository && await githubToken(call.from.id, repository);
    if (!token) { await edit('githubReconnect', [[button('githubConnect', 'connect')], back]); return true; }
    const request = { id: crypto.randomUUID(), tag, group, thread: topic.thread,
      message: call.message.message_id, language, state: 'queued' };
    const claim = await db.run(`INSERT INTO support_config (key, value, updated_at)
      VALUES ('update_request', :value, unixepoch())
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      WHERE json_extract(support_config.value, '$.state') IN ('done', 'failed')`,
    { ':value': JSON.stringify(request) });
    if (!claim.rowsAffected) { await edit('updateBusy', [back]); return true; }
    let response;
    try {
      response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/update-bot.yml/dispatches`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json', 'User-Agent': 'Gramless-Updates', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { request_id: request.id, release_tag: tag } }),
      });
      if (response.status >= 500) throw new Error('Dispatch result is uncertain');
    } catch {
      // A failed response can follow an accepted dispatch; never resend blindly.
      await edit('updateUncertain', [back]); return true;
    }
    if (response.status !== 204) {
      await db.run(`UPDATE support_config SET value = :value, updated_at = unixepoch()
        WHERE key = 'update_request' AND json_extract(value, '$.id') = :id`,
      { ':value': JSON.stringify({ ...request, state: 'failed' }), ':id': request.id });
      await edit('updateDispatchFailed', [[button('githubConnect', 'connect')], back]);
    } else await edit('updateChecking', [back]);
  }
  return true;
}
