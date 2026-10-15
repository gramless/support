import { api, db, BotApiError } from 'sdk';
import * as store from './store.js';
import { languageFor, screen } from './interface.js';
import { t } from './i18n.js';
import { hasContent } from './format.js';

const active = "('compose', 'buttons', 'preview', 'date', 'sending')";
const button = (text, action, id) => ({ text, callback_data: `nl:${action}${id ? ':' + id : ''}` });
const timestamp = seconds => new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ');

async function owned(user, id) {
  return db.get('SELECT * FROM support_newsletters WHERE id = :id AND owner_id = :owner', { ':id': id, ':owner': user.id });
}

async function change(row, state) {
  return db.run('UPDATE support_newsletters SET state = :state WHERE id = :id AND state = :old',
    { ':id': row.id, ':state': state, ':old': row.state });
}

async function counts(id) {
  const rows = await db.all('SELECT state, count(*) AS n FROM support_newsletter_recipients WHERE newsletter_id = :id GROUP BY state', { ':id': id });
  return { sent: 0, failed: 0, pending: 0, uncertain: 0, ...Object.fromEntries(rows.map(row => [row.state, row.n])) };
}

async function render(user, row) {
  const language = await languageFor(user);
  const key = { compose: 'compose', buttons: 'buttonsPrompt', preview: 'preview', date: 'datePrompt',
    cancelled: 'cancelled', complete: 'complete', sending: 'newsletter' }[row.state];
  let text = t(language, key);
  const keyboard = [];
  if (row.state === 'preview') {
    keyboard.push([button(t(language, 'previewButton'), 'preview', row.id), button(t(language, 'edit'), 'edit', row.id)]);
    keyboard.push([button(t(language, 'send'), 'send', row.id)], [button(t(language, 'schedule'), 'date', row.id)]);
    if (row.not_before) text += '\n' + t(language, 'readyAt', { time: timestamp(row.not_before) });
  }
  if (['sending', 'complete'].includes(row.state)) {
    text += '\n' + t(language, 'progress', await counts(row.id));
    if (row.state === 'sending') keyboard.push([button(t(language, 'continue'), 'send', row.id)]);
  }
  if (!['complete', 'cancelled'].includes(row.state)) keyboard.push([button(t(language, 'cancel'), 'cancel', row.id)]);
  keyboard.push([button(t(language, 'back'), 'list')]);
  return screen(user, text, { inline_keyboard: keyboard });
}

export async function newsletterMenu(user) {
  const language = await languageFor(user);
  if (!await store.isOwner(user.id)) return screen(user, t(language, 'ownerOnly'));
  const rows = await db.all('SELECT * FROM support_newsletters WHERE owner_id = :owner ORDER BY id DESC LIMIT 10', { ':owner': user.id });
  return screen(user, t(language, rows.length ? 'newsletter' : 'empty'), { inline_keyboard: [
    [button(t(language, 'newNewsletter'), 'new')],
    ...rows.map(row => [button(t(language, 'saved', { id: row.id, state: t(language,
      { compose: 'compose', buttons: 'buttonsPrompt', date: 'schedule', preview: 'previewButton', sending: 'newsletter', complete: 'complete', cancelled: 'cancelled' }[row.state]).split(/[.!\n]/)[0].slice(0, 32) }), 'open', row.id)]),
  ] });
}

export function parseButtons(text) {
  if (typeof text !== 'string') return null;
  const lines = text.trim().split('\n');
  if (!lines.length || lines.length > 8) return null;
  const rows = [];
  for (const line of lines) {
    const parts = line.split('|').map(part => part.trim());
    if (parts.length !== 2 || !parts[0] || parts[0].length > 64) return null;
    // The runtime need not provide URL. Strict HTTPS authority validation avoids
    // script links, credentials, whitespace and malformed callback-style payloads.
    if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s<>]*)?$/i.test(parts[1])) return null;
    rows.push([{ text: parts[0], url: parts[1] }]);
  }
  return rows;
}

async function preview(user, row) {
  const buttons = JSON.parse(row.buttons);
  try {
    await api.copyMessage({ chat_id: user.id, from_chat_id: user.id, message_id: row.source_message_id,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });
  } catch (error) {
    if (!(error instanceof BotApiError) || error.code !== 400
      || !/message.*(can't be copied|cannot be copied|to copy not found)|protected content|quiz/i.test(error.description || '')) throw error;
    return screen(user, t(await languageFor(user), 'draftFailed'), { inline_keyboard: [
      [button(t(await languageFor(user), 'edit'), 'edit', row.id)],
    ] });
  }
  return render(user, row);
}

export async function cancelDraft(user) {
  if (!await store.isOwner(user.id)) return false;
  const result = await db.run(`UPDATE support_newsletters SET state = 'cancelled'
    WHERE owner_id = :owner AND state IN ('compose', 'buttons', 'preview', 'date')`, { ':owner': user.id });
  if (result.rowsAffected) await screen(user, t(await languageFor(user), 'cancelled'));
  return result.rowsAffected > 0;
}

export async function captureNewsletter(message) {
  if (!await store.isOwner(message.from.id)) return false;
  const row = await db.get("SELECT * FROM support_newsletters WHERE owner_id = :owner AND state IN ('compose', 'buttons', 'date')",
    { ':owner': message.from.id });
  if (!row) return false;
  const user = message.from;
  const language = await languageFor(user);
  if (row.state === 'compose') {
    if (!hasContent(message)) return true;
    await db.run("UPDATE support_newsletters SET source_message_id = :message, state = 'buttons' WHERE id = :id AND state = 'compose'",
      { ':id': row.id, ':message': message.message_id });
  } else if (row.state === 'buttons') {
    const buttons = message.text === '/skip' ? [] : parseButtons(message.text);
    if (!buttons) { await screen(user, t(language, 'buttonsInvalid')); return true; }
    await db.run("UPDATE support_newsletters SET buttons = :buttons, state = 'preview' WHERE id = :id AND state = 'buttons'",
      { ':id': row.id, ':buttons': JSON.stringify(buttons) });
    await preview(user, await owned(user, row.id));
    return true;
  } else {
    const text = message.text || '';
    const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) ? Date.parse(text.replace(' ', 'T') + ':00Z') / 1000 : NaN;
    if (!Number.isSafeInteger(date) || date <= Date.now() / 1000 || timestamp(date) !== text) {
      await screen(user, t(language, 'dateInvalid')); return true;
    }
    await db.run("UPDATE support_newsletters SET not_before = :date, state = 'preview' WHERE id = :id AND state = 'date'",
      { ':id': row.id, ':date': date });
  }
  await render(user, await owned(user, row.id));
  return true;
}

async function sendBatch(user, row) {
  const language = await languageFor(user);
  if (row.not_before > Date.now() / 1000) return screen(user, t(language, 'notDue', { time: timestamp(row.not_before) }));
  if (row.retry_at > Date.now() / 1000) return screen(user, t(language, 'rateLimited', { seconds: Math.ceil(row.retry_at - Date.now() / 1000) }));
  if (row.state === 'preview') {
    // A single SQL statement freezes the audience; repeats cannot duplicate recipients.
    await db.run(`INSERT INTO support_newsletter_recipients (newsletter_id, user_id)
      SELECT :id, u.user_id FROM support_users u LEFT JOIN support_conversations c ON c.tg_user_id = u.user_id
      WHERE u.bot_status = 'member' AND COALESCE(c.banned, 0) = 0 AND u.user_id != :owner
      ON CONFLICT(newsletter_id, user_id) DO NOTHING`, { ':id': row.id, ':owner': user.id });
    await change(row, 'sending');
  }
  const token = crypto.randomUUID();
  const claim = await db.run(`UPDATE support_newsletters SET lease_token = :token, lease_until = unixepoch() + 60
    WHERE id = :id AND state = 'sending' AND (lease_token IS NULL OR lease_until < unixepoch())`, { ':id': row.id, ':token': token });
  if (!claim.rowsAffected) return screen(user, t(language, 'busy'));
  let rateLimited = false;
  try {
    // An interrupted send is ambiguous; do not blindly resend it after lease expiry.
    await db.run("UPDATE support_newsletter_recipients SET state = 'uncertain' WHERE newsletter_id = :id AND state = 'sending'", { ':id': row.id });
    const recipients = await db.all(`SELECT r.user_id FROM support_newsletter_recipients r
      WHERE r.newsletter_id = :id AND r.state = 'pending' ORDER BY r.user_id LIMIT 5`, { ':id': row.id });
    for (const recipient of recipients) {
      const renew = await db.run('UPDATE support_newsletters SET lease_until = unixepoch() + 60 WHERE id = :id AND lease_token = :token', { ':id': row.id, ':token': token });
      if (!renew.rowsAffected) break;
      const eligible = await db.get(`SELECT u.user_id FROM support_users u LEFT JOIN support_conversations c ON c.tg_user_id = u.user_id
        WHERE u.user_id = :user AND u.bot_status = 'member' AND COALESCE(c.banned, 0) = 0`, { ':user': recipient.user_id });
      let state = eligible ? 'sending' : 'failed';
      const recipientClaim = await db.run(`UPDATE support_newsletter_recipients SET state = :state
        WHERE newsletter_id = :id AND user_id = :user AND state = 'pending'
        AND EXISTS (SELECT 1 FROM support_newsletters WHERE id = :id AND lease_token = :token)`,
        { ':id': row.id, ':user': recipient.user_id, ':state': state, ':token': token });
      if (!recipientClaim.rowsAffected) break;
      if (!eligible) continue;
      let unexpected;
      let sourceGone = false;
      try {
        const buttons = JSON.parse(row.buttons);
        await api.copyMessage({ chat_id: recipient.user_id, from_chat_id: user.id, message_id: row.source_message_id,
          ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });
        state = 'sent';
      } catch (error) {
        if (error instanceof BotApiError && error.code === 429) {
          state = 'pending'; rateLimited = true;
          const seconds = Number.isSafeInteger(error.parameters?.retry_after) ? Math.max(1, error.parameters.retry_after) : 30;
          await db.run('UPDATE support_newsletters SET retry_at = unixepoch() + :seconds WHERE id = :id AND lease_token = :token',
            { ':id': row.id, ':token': token, ':seconds': seconds });
        } else if (error instanceof BotApiError && [400, 403].includes(error.code)) {
          state = 'failed';
          sourceGone = error.code === 400 && /message.*(to copy not found|can't be copied|cannot be copied)/i.test(error.description || '');
        }
        else {
          // Unknown transport results remain visible as uncertain and are never auto-retried.
          console.warn('support.newsletter_uncertain', { code: error.code, method: error.method });
          state = 'uncertain';
          if (!(error instanceof BotApiError)) unexpected = error;
        }
      }
      await db.run(`UPDATE support_newsletter_recipients SET state = :state WHERE newsletter_id = :id AND user_id = :user
        AND EXISTS (SELECT 1 FROM support_newsletters WHERE id = :id AND lease_token = :token)`,
        { ':id': row.id, ':user': recipient.user_id, ':state': state, ':token': token });
      if (unexpected) throw unexpected;
      if (sourceGone) {
        await db.run("UPDATE support_newsletter_recipients SET state = 'failed' WHERE newsletter_id = :id AND state = 'pending'", { ':id': row.id });
        break;
      }
      if (rateLimited) break;
    }
    const remaining = await counts(row.id);
    if (!remaining.pending) await db.run("UPDATE support_newsletters SET state = 'complete' WHERE id = :id AND lease_token = :token", { ':id': row.id, ':token': token });
  } finally {
    await db.run('UPDATE support_newsletters SET lease_token = NULL, lease_until = 0 WHERE id = :id AND lease_token = :token', { ':id': row.id, ':token': token });
  }
  return render(user, await owned(user, row.id));
}

export async function newsletterCallback(call) {
  const user = call.from;
  const language = await languageFor(user);
  if (!await store.isOwner(user.id)) return screen(user, t(language, 'ownerOnly'));
  const match = /^nl:(list|new|open|edit|preview|date|send|cancel)(?::([1-9]\d*))?$/.exec(call.data);
  if (!match) return;
  const [, action, idText] = match;
  if (action === 'list') return newsletterMenu(user);
  if (action === 'new') {
    await db.run(`INSERT INTO support_newsletters (owner_id) SELECT :owner
      WHERE NOT EXISTS (SELECT 1 FROM support_newsletters WHERE owner_id = :owner AND state IN ${active})`, { ':owner': user.id });
    const row = await db.get(`SELECT * FROM support_newsletters WHERE owner_id = :owner AND state IN ${active}`, { ':owner': user.id });
    return render(user, row);
  }
  const id = Number(idText);
  if (!Number.isSafeInteger(id)) return;
  const row = await owned(user, id);
  if (!row) return;
  if (action === 'open') return render(user, row);
  if (['complete', 'cancelled'].includes(row.state)) return screen(user, t(language, 'stale'));
  if (action === 'cancel') {
    const result = await db.run("UPDATE support_newsletters SET state = 'cancelled' WHERE id = :id AND (lease_token IS NULL OR lease_until < unixepoch())", { ':id': id });
    return result.rowsAffected ? render(user, { ...row, state: 'cancelled' }) : screen(user, t(language, 'busy'));
  }
  if (action === 'send' && ['preview', 'sending'].includes(row.state)) return sendBatch(user, row);
  if (row.state !== 'preview') return;
  if (action === 'preview') return preview(user, row);
  if (action === 'edit' || action === 'date') {
    await change(row, action === 'edit' ? 'compose' : 'date');
    return render(user, await owned(user, id));
  }
}
