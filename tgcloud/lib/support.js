import { api, BotApiError } from 'sdk';
import * as store from './store.js';
import { telegramId, threadId, topicTitle, topicIntroduction, contactInfo, command, hasContent } from './format.js';
import { locale, t } from './i18n.js';
import { languageFor, welcome, languageMenu, screen, receipt, pinIfAllowed } from './interface.js';
import { newsletterMenu, captureNewsletter, cancelDraft } from './newsletter.js';
import { updatesCommand } from './updater.js';

function apiError(error, code, pattern) {
  return error instanceof BotApiError && error.code === code && pattern.test(error.description || '');
}

function missingTopic(error) {
  return apiError(error, 400, /message thread not found|forum topic not found|topic_deleted|topic_id_invalid|message_thread_invalid/i);
}

function closedTopic(error) {
  return apiError(error, 400, /topic_closed|topic is closed/i);
}

function alreadyOpen(error) {
  return apiError(error, 400, /topic_not_modified|topic is not closed/i);
}

async function topicNote(row, text, formatted = false) {
  return api.sendMessage({ chat_id: row.topic_chat_id, message_thread_id: row.message_thread_id,
    text, ...(formatted ? { parse_mode: 'HTML' } : {}) });
}

async function removeUnusedTopic(group, thread) {
  try {
    await api.deleteForumTopic({ chat_id: group, message_thread_id: thread });
  } catch (error) {
    if (missingTopic(error)) return;
    console.error('support.topic_cleanup_failed', { code: error.code, method: error.method });
    throw error;
  }
}

async function replaceTopic(row) {
  const current = await store.byUser(row.tg_user_id);
  if (current.message_thread_id !== row.message_thread_id) return current;
  const title = topicTitle(current);
  const emoji = await store.setting('topic_emoji_id');
  const topic = await api.createForumTopic({ chat_id: current.topic_chat_id, name: title,
    ...(emoji ? { icon_custom_emoji_id: emoji } : {}) });
  const thread = threadId(topic.message_thread_id);
  if (!thread) throw new Error('Telegram returned an invalid support topic ID');
  let info;
  try {
    const language = locale(await store.setting('staff_language'));
    info = await topicNote({ ...current, message_thread_id: thread },
      topicIntroduction({ ...current, status: 'open', message_thread_id: thread }, language), true);
  } catch (error) {
    await removeUnusedTopic(current.topic_chat_id, thread);
    throw error;
  }
  // Only one invocation adopts the replacement. Others discard their unused topic
  // and copy to the winner; no isolate-local lock or timer is needed.
  const adopted = await store.adoptTopic(current, thread, title, info.message_id);
  if (!adopted) await removeUnusedTopic(current.topic_chat_id, thread);
  else await pinIfAllowed(current.topic_chat_id, info.message_id);
  const saved = await store.byUser(row.tg_user_id);
  if (!threadId(saved?.message_thread_id)) throw new Error('Support topic mapping was not saved');
  return saved;
}

async function reopen(row) {
  try {
    await api.reopenForumTopic({ chat_id: row.topic_chat_id, message_thread_id: row.message_thread_id });
  } catch (error) {
    if (!alreadyOpen(error)) throw error;
  }
  await store.setStatus(row, 'open');
  return { ...row, status: 'open' };
}

function copy(message, chat, thread) {
  return api.copyMessage({ chat_id: chat, from_chat_id: message.chat.id, message_id: message.message_id,
    ...(thread ? { message_thread_id: thread } : {}) });
}

async function inbound(message, group) {
  let row = await store.inbound(message.from, group);
  if (row.banned) return;
  if (row.topic_chat_id !== group) throw new Error('Conversation belongs to another support group');
  try {
    if (!threadId(row.message_thread_id)) row = await replaceTopic(row);
    if (row.status === 'closed') row = await reopen(row);
    const title = topicTitle(row);
    if (row.topic_title !== title) {
      try {
        await api.editForumTopic({ chat_id: group, message_thread_id: row.message_thread_id, name: title });
      } catch (error) {
        if (!apiError(error, 400, /topic_not_modified|topic is not modified/i)) throw error;
      }
      await store.saveTitle(row, title);
    }
    await copy(message, group, row.message_thread_id);
  } catch (error) {
    // Retry the actual message once. Permission/transport errors never create topics.
    if (missingTopic(error)) row = await replaceTopic(row);
    else if (closedTopic(error)) row = await reopen(row);
    else throw error;
    await copy(message, group, row.message_thread_id);
  }
  await receipt(message.from, 'sent');
}

async function authorized(message, adminOnly = false) {
  const member = await api.getChatMember({ chat_id: message.chat.id, user_id: message.from.id });
  if (['creator', 'administrator'].includes(member.status)) return true;
  return !adminOnly && (member.status === 'member' || (member.status === 'restricted' && member.is_member));
}

async function ownCommand(parsed) {
  if (!parsed.target) return true;
  const me = await api.getMe();
  return parsed.target === me.username?.toLowerCase();
}

async function operatorCommand(row, message, parsed) {
  if (!await ownCommand(parsed)) return;
  const language = await languageFor(message.from);
  if (['info', 'information'].includes(parsed.name)) {
    const preferences = await store.preferences(row.tg_user_id);
    return topicNote(row, contactInfo({ ...row, language: preferences?.language,
      bot_status: preferences?.bot_status }, true, language), true);
  }
  if (!['ban', 'silent', 'close'].includes(parsed.name)) return;
  if (!await authorized(message, true)) return topicNote(row, t(language, 'adminOnly'));
  if (parsed.name === 'ban') {
    const saved = await store.toggle(row, 'banned');
    return topicNote(saved, t(language, saved.banned ? 'banned' : 'unbanned'));
  }
  if (parsed.name === 'silent') {
    const saved = await store.toggle(row, 'silent');
    const note = await topicNote(saved, t(language, saved.silent ? 'silentOn' : 'silentOff'));
    if (saved.silent) {
      if (await pinIfAllowed(saved.topic_chat_id, note.message_id)) await store.silentNotice(saved, note.message_id);
    } else if (saved.silent_notice_id) {
      try {
        await api.unpinChatMessage({ chat_id: saved.topic_chat_id, message_id: saved.silent_notice_id });
      } catch (error) {
        if (!apiError(error, 400, /message to unpin not found|message is not pinned|not enough rights|chat_admin_required/i)
          && !apiError(error, 403, /not enough rights/i)) throw error;
      }
      await store.silentNotice(saved, null);
    }
    return;
  }
  // Telegram's native close notification is the acknowledgement. Posting a
  // separate confirmation can reopen a topic that staff already closed.
  try {
    await api.closeForumTopic({ chat_id: row.topic_chat_id, message_thread_id: row.message_thread_id });
  } catch (error) {
    if (!apiError(error, 400, /topic_not_modified|topic is already closed/i)) throw error;
  }
  await store.setStatus(row, 'closed');
}

async function outbound(message, group) {
  const thread = threadId(message.message_thread_id);
  if (!thread || message.is_topic_message !== true) return;
  const row = await store.byTopic(group, thread);
  if (!row || telegramId(row.tg_user_id) <= 0 || !await authorized(message)) return;
  const parsed = command(message.text);
  if (parsed) return operatorCommand(row, message, parsed);
  // Unknown slash commands are staff-only too, including malformed mentions.
  if (message.text?.trimStart().startsWith('/')) return;
  if (row.silent || row.status === 'closed') return;
  try {
    await copy(message, row.tg_user_id);
  } catch (error) {
    if (apiError(error, 403, /blocked|deactivated|can't initiate|forbidden/i)
      || apiError(error, 400, /chat not found|user is deactivated/i)) {
      return topicNote(row, t(await languageFor(message.from), 'blocked'));
    }
    throw error;
  }
  await store.delivered(row);
  await api.sendMessage({ chat_id: group, message_thread_id: thread,
    text: t(await languageFor(message.from), 'sentToUser'),
    ephemeral_message_parameters: { receiver_user_id: message.from.id } });
}

async function reportExpectedFailure(error, message) {
  if (!(error instanceof BotApiError)) throw error;
  console.warn('support.telegram_failure', { code: error.code, method: error.method });
  let text;
  const language = await languageFor(message.from);
  if (apiError(error, 400, /message.*(can't be copied|cannot be copied|to copy not found)|protected content|quiz/i)) {
    text = t(language, 'copyFailed');
  } else if ((error.code === 403 && !/blocked|deactivated/i.test(error.description || ''))
    || apiError(error, 400, /not enough rights|chat not found|chat_write_forbidden|bot is not a member/i)) {
    text = t(language, message.chat.type === 'private' ? 'deliveryFailed' : 'groupFailed');
  } else throw error;
  return api.sendMessage({ chat_id: message.chat.id,
    ...(message.chat.type === 'supergroup' ? { message_thread_id: message.message_thread_id } : {}), text });
}

export async function handleMessage(message) {
  if (message?.chat?.type === 'supergroup' && threadId(message.message_thread_id)
    && Number.isSafeInteger(message.message_id)
    && (message.pinned_message || message.forum_topic_edited || message.forum_topic_closed || message.forum_topic_reopened)
    && message.chat.id === await store.supportGroup()) {
    const row = await store.byTopic(message.chat.id, message.message_thread_id);
    if (!row) return;
    // Our own close/reopen calls persist state directly. Delayed bot service
    // updates must not overwrite a newer user-driven reopen.
    if (message.from?.is_bot === false && (message.forum_topic_closed || message.forum_topic_reopened)) {
      await store.setStatus(row, message.forum_topic_closed ? 'closed' : 'open');
    }
    // Preserve native lifecycle notifications and never send a reply to them.
    if (message.forum_topic_closed || message.forum_topic_reopened) return;
    try {
      await api.deleteMessage({ chat_id: message.chat.id, message_id: message.message_id });
    } catch (error) {
      if (!apiError(error, 400, /message.*(can't be deleted|to delete not found)|not enough rights|chat_admin_required/i)
        && !apiError(error, 403, /not enough rights|chat_admin_required/i)) throw error;
      console.warn('support.service_cleanup_unavailable', { code: error.code });
    }
    return;
  }
  if (!message || !Number.isSafeInteger(message.message_id) || message.message_id <= 0
    || !telegramId(message.chat?.id) || telegramId(message.from?.id) <= 0
    || message.from?.is_bot !== false || message.sender_chat || !hasContent(message)) return;
  const privateChat = message.chat.type === 'private';
  if (!privateChat && message.chat.type !== 'supergroup') return;
  if (privateChat && message.chat.id !== message.from.id) return;
  const parsed = command(message.text);
  if (privateChat) {
    await store.rememberUser(message.from.id);
    await store.savePreference(message.from.id, 'bot_status', 'member');
    if (parsed && ['start', 'language', 'source', 'newsletter', 'cancel', 'updates'].includes(parsed.name)) {
      if (!await ownCommand(parsed)) return;
      if (parsed.name === 'start') { await cancelDraft(message.from); return welcome(message.from); }
      if (parsed.name === 'language') return languageMenu(message.from);
      if (parsed.name === 'source') return screen(message.from, t(await languageFor(message.from), 'source'));
      if (parsed.name === 'newsletter') return newsletterMenu(message.from);
      if (parsed.name === 'cancel') return cancelDraft(message.from);
      if (parsed.name === 'updates') return updatesCommand(message);
    }
    if (await captureNewsletter(message)) return;
  } else if (parsed?.name === 'id' && await ownCommand(parsed) && await authorized(message)) {
    return api.sendMessage({ chat_id: message.chat.id,
      ...(threadId(message.message_thread_id) ? { message_thread_id: message.message_thread_id } : {}), text: String(message.chat.id) });
  }
  const group = await store.supportGroup();
  if (!group) {
    if (privateChat) return api.sendMessage({ chat_id: message.chat.id,
      text: t(await languageFor(message.from), 'notSetup') });
    return;
  }
  if (!privateChat && message.chat.id !== group) return;
  try {
    if (privateChat) return await inbound(message, group);
    return await outbound(message, group);
  } catch (error) {
    return reportExpectedFailure(error, message);
  }
}
