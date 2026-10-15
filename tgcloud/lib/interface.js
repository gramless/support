import { api, BotApiError } from 'sdk';
import * as store from './store.js';
import { languages, locale, t, privateCommands } from './i18n.js';
import { telegramId } from './format.js';

function unavailable(error) {
  return error instanceof BotApiError && error.code === 400
    && /message (is not modified|to edit not found|can't be edited)|message_id_invalid/i.test(error.description || '');
}

export async function languageFor(user) {
  const preferences = await store.preferences(user.id);
  return locale(preferences?.language || user.language_code);
}

export async function screen(user, text, replyMarkup, field = 'menu_message_id') {
  const preferences = await store.rememberUser(user.id);
  const params = { chat_id: user.id, text, reply_markup: replyMarkup || { inline_keyboard: [] } };
  if (preferences[field]) {
    try {
      return await api.editMessageText({ ...params, message_id: preferences[field] });
    } catch (error) {
      if (!unavailable(error)) throw error;
      if (/message is not modified/i.test(error.description)) return;
    }
  }
  const message = await api.sendMessage(params);
  await store.savePreference(user.id, field, message.message_id);
  return message;
}

export async function languageMenu(user) {
  const language = await languageFor(user);
  return screen(user, t(language, 'chooseLanguage'), { inline_keyboard: [
    Object.entries(languages).map(([code, text]) => ({ text, callback_data: 'language:' + code })),
  ] });
}

export async function welcome(user) {
  const preferences = await store.rememberUser(user.id);
  if (!preferences.language) return languageMenu(user);
  return screen(user, t(preferences.language, 'welcome'), { inline_keyboard: [
    [{ text: t(preferences.language, 'language'), callback_data: 'language:menu' }],
  ] });
}

export async function receipt(user, key) {
  return screen(user, t(await languageFor(user), key), undefined, 'receipt_message_id');
}

export async function languageCallback(call) {
  const user = call.from;
  const preferences = await store.rememberUser(user.id);
  if (preferences.menu_message_id !== call.message.message_id) return;
  const code = call.data.slice('language:'.length);
  if (code === 'menu') return languageMenu(user);
  if (!Object.hasOwn(languages, code)) return;
  await store.savePreference(user.id, 'language', code);
  await api.setMyCommands({ scope: { type: 'chat', chat_id: user.id },
    commands: privateCommands(code, await store.isOwner(user.id)) });
  return welcome(user);
}

export async function acknowledge(call) {
  if (typeof call?.id !== 'string' || !telegramId(call.from?.id) || call.from?.is_bot !== false) return false;
  try {
    await api.answerCallbackQuery({ callback_query_id: call.id });
  } catch (error) {
    if (error instanceof BotApiError && error.code === 400 && /query is too old|query_id_invalid/i.test(error.description || '')) return false;
    throw error;
  }
  return call.message?.chat?.type === 'private' && call.message.chat.id === call.from.id
    && typeof call.data === 'string' && call.data.length <= 64;
}

export async function pinIfAllowed(group, messageId) {
  const me = await api.getMe();
  const member = await api.getChatMember({ chat_id: group, user_id: me.id });
  if (member.status !== 'creator' && !member.can_pin_messages) return false;
  try {
    await api.pinChatMessage({ chat_id: group, message_id: messageId, disable_notification: true });
    return true;
  } catch (error) {
    if (!(error instanceof BotApiError) || ![400, 403].includes(error.code)
      || !/not enough rights|message to pin not found|chat_admin_required/i.test(error.description || '')) throw error;
    console.warn('support.pin_unavailable', { code: error.code });
    return false;
  }
}
