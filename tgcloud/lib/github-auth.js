import { api, db, fetch, BotApiError } from 'sdk';
import * as store from './store.js';
import { t } from './i18n.js';

export async function saveUpdateSetting(key, value) {
  await db.run(`INSERT INTO support_config (key, value, updated_at) VALUES (:key, :value, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  { ':key': key, ':value': value });
}

export async function githubToken(owner, repository) {
  const auth = JSON.parse(await store.setting('update_auth') || 'null');
  return auth?.owner === owner && auth.repository === repository
    && auth.expires > Math.floor(Date.now() / 1000) + 60 ? auth.token : null;
}

async function oauth(path, body) {
  try {
    const response = await fetch('https://github.com/login/' + path, { method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Gramless-Updates' },
      body: JSON.stringify(body) });
    return response.ok ? await response.json() : { error: 'request_failed' };
  } catch { return { error: 'request_failed' }; }
}

export async function connectGithub(owner, language) {
  const repository = await store.setting('update_repository');
  if (!/^[\w-]+\/[\w.-]+$/.test(repository || '')) return 'updatesRepositoryMissing';
  const repoResponse = await fetch('https://api.github.com/repos/' + repository, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Gramless-Updates' },
  });
  if (!repoResponse.ok) return 'githubAuthFailed';
  const repositoryId = (await repoResponse.json()).id;
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return 'githubAuthFailed';
  // Public identifier of the registered Gramless Updates app, never a client secret.
  const client = await store.setting('github_app_client_id') || 'Iv23lirP23YIRgenKbeN';
  if (typeof client !== 'string' || !/^[\w.]{6,100}$/.test(client)) return 'githubAppUnavailable';
  const result = await oauth('device/code', { client_id: client });
  if (result.error || typeof result.device_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(result.user_code || '')
    || !Number.isSafeInteger(result.expires_in) || !Number.isSafeInteger(result.interval)
    || result.expires_in <= 0 || result.interval <= 0) return 'githubAuthFailed';
  const now = Math.floor(Date.now() / 1000);
  const device = { id: crypto.randomUUID(), owner, client, repository, repositoryId, code: result.device_code,
    expires: now + result.expires_in, next: now + result.interval, interval: result.interval, language };
  let message;
  try {
    message = await api.sendMessage({ chat_id: owner, text: t(language, 'githubDevice', { code: result.user_code }),
      reply_markup: { inline_keyboard: [
        [{ text: t(language, 'githubAuthorize'), url: 'https://github.com/login/device' }],
        [{ text: t(language, 'githubCheck'), callback_data: 'upauth:' + device.id }],
      ] } });
  } catch (error) {
    if (error instanceof BotApiError && [400, 403].includes(error.code)) return 'githubStartBot';
    throw error;
  }
  await saveUpdateSetting('update_device', JSON.stringify({ ...device, message: message.message_id }));
  return 'githubCheckPrivate';
}

export async function authCallback(call, language) {
  const raw = await store.setting('update_device');
  const device = JSON.parse(raw || 'null');
  const now = Math.floor(Date.now() / 1000);
  if (call.message?.chat?.type !== 'private' || call.message.chat.id !== call.from.id
    || device?.owner !== call.from.id || call.data !== 'upauth:' + device.id
    || device.message !== call.message.message_id || !await store.isOwner(call.from.id)) return 'updateDenied';
  if (device.expires <= now) return 'githubExpired';
  if (device.next > now) return 'githubPending';
  const claimed = JSON.stringify({ ...device, next: now + device.interval });
  const claim = await db.run("UPDATE support_config SET value = :value WHERE key = 'update_device' AND value = :previous",
    { ':value': claimed, ':previous': raw });
  if (!claim.rowsAffected) return 'githubPending';
  const result = await oauth('oauth/access_token', { client_id: device.client,
    device_code: device.code, repository_id: device.repositoryId,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
  if (result.error === 'authorization_pending') return 'githubPending';
  if (result.error === 'slow_down') {
    const interval = Number.isSafeInteger(result.interval) && result.interval > 0 ? result.interval : device.interval + 5;
    await db.run("UPDATE support_config SET value = :value WHERE key = 'update_device' AND value = :previous",
      { ':value': JSON.stringify({ ...device, interval, next: now + interval }), ':previous': claimed });
    return 'githubPending';
  }
  if (result.error === 'expired_token' || result.error === 'access_denied') return 'githubExpired';
  if (typeof result.access_token !== 'string' || !result.access_token || result.error
    || !Number.isSafeInteger(result.expires_in) || result.expires_in <= 0) return 'githubAuthFailed';
  // Short-lived device-flow user token only. No app private key, client secret or refresh token is retained.
  await saveUpdateSetting('update_auth', JSON.stringify({ owner: call.from.id, repository: device.repository, token: result.access_token,
    expires: now + result.expires_in }));
  await db.run("DELETE FROM support_config WHERE key = 'update_device' AND value = :previous", { ':previous': claimed });
  await api.editMessageText({ chat_id: call.from.id, message_id: call.message.message_id,
    text: t(language, 'githubConnected'), reply_markup: { inline_keyboard: [] } });
  return 'githubConnected';
}
