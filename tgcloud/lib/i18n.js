export const languages = { en: 'English', ru: 'Русский' };

export function locale(value) {
  const code = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : 'en';
  return Object.hasOwn(languages, code) ? code : 'en';
}

export const messages = {
  en: {
    updatesTopic: 'Gramless Support updates',
    updateAvailable: 'Update available: Gramless Support {version}\nInstalled version: {installed}\n\nReview the release notes before updating your bot.',
    viewRelease: 'View release',
    chooseLanguage: 'Choose your language / Выберите язык:',
    welcome: 'Send your question here. Our support team will reply in this chat.',
    language: 'Change language', source: 'Based on nessshon/support-bot by Shon Ness. Original source: https://github.com/nessshon/support-bot',
    sent: 'Message sent to support. Please wait for a reply.', sentToUser: 'Reply delivered to the user.',
    edited: 'Edits stay in your chat. Send a new message if you want support to receive the correction.',
    notSetup: 'Support is not set up yet. Please contact the team through their existing support channel.',
    copyFailed: 'This message could not be copied. Please send it again as text or a regular file.',
    deliveryFailed: 'Your message could not reach support. Please try again later.',
    groupFailed: 'Support delivery failed. Check the support group and bot permissions, then try again.',
    blocked: 'Reply not delivered. The user may have blocked the bot or deleted their account.',
    adminOnly: 'Only group administrators can change support settings.',
    banned: 'User banned. Their messages will no longer arrive here.', unbanned: 'User unbanned. Their messages can arrive here again.',
    silentOn: 'Silent mode on. Replies stay in this topic; the user can still write to support.',
    silentOff: 'Silent mode off. Replies will reach the user.',
    stopped: 'The user stopped the bot.', restarted: 'The user restarted the bot.',
    started: 'User {name} started the bot!',
    guidance: 'List of available commands:\n\n• /ban\n<b>Block/Unblock user</b>\n<blockquote>Block the user if you do not want to receive messages from them.</blockquote>\n\n• /silent\n<b>Activate/Deactivate silent mode</b>\n<blockquote>When silent mode is enabled, messages are not sent to the user.</blockquote>\n\n• /information\n<b>User information</b>\n<blockquote>Receive a message with basic information about the user.</blockquote>',
    contact: 'Support contact', fullName: 'Full name', username: 'Username', telegramId: 'Telegram ID',
    telegramLanguage: 'Telegram language', languageLabel: 'Language', firstContact: 'First contact', status: 'Status',
    lastInbound: 'Last inbound', lastOutbound: 'Last outbound', bannedLabel: 'Banned', silentLabel: 'Silent', topicId: 'Topic ID',
    botStatus: 'Bot status', yes: 'Yes', no: 'No', open: 'Open', closed: 'Closed',
    ownerOnly: 'Only the configured bot owner can use newsletters.',
    newsletter: 'Newsletters', newNewsletter: 'New newsletter', cancel: 'Cancel', back: 'Back',
    compose: 'Send the message to broadcast: text, photo, video or another copyable message. Use /cancel to discard this draft.',
    buttonsPrompt: 'Optional link buttons: one per line, using Label | https://example.com. Send /skip for no buttons.',
    buttonsInvalid: 'Use Label | https://example.com, one button per line (up to 8). Only HTTPS links are allowed.',
    preview: 'Preview the message above. Confirm when you are ready to send it to eligible registered users.',
    previewButton: 'Preview', edit: 'Replace message', send: 'Send now', schedule: 'Choose a time',
    datePrompt: 'Send a future UTC time as YYYY-MM-DD HH:mm. At that time, open /newsletter and press Send now. Sending is not automatic.',
    dateInvalid: 'Enter a valid future UTC time, for example 2027-01-20 14:30.',
    progress: 'Sent: {sent}. Failed: {failed}. Uncertain: {uncertain}. Remaining: {pending}.',
    continue: 'Send next batch', complete: 'Newsletter finished.', cancelled: 'Newsletter cancelled.',
    busy: 'A batch is running. Please try again shortly.', notDue: 'This newsletter is not due yet. Ready at {time} UTC.',
    rateLimited: 'Telegram rate limit. Retry in {seconds} seconds.',
    stale: 'This action is no longer available. Open /newsletter again.',
    draftFailed: 'The source message could not be copied. Replace it before continuing.',
    saved: 'Draft #{id} · {state}', readyAt: 'Ready at {time} UTC. Open /newsletter then to send.',
    empty: 'No newsletters yet.',
  },
  ru: {
    updatesTopic: 'Обновления Gramless Support',
    updateAvailable: 'Доступно обновление Gramless Support {version}\nУстановленная версия: {installed}\n\nПеред обновлением бота ознакомьтесь с описанием выпуска.',
    viewRelease: 'Открыть выпуск',
    chooseLanguage: 'Выберите язык / Choose your language:',
    welcome: 'Напишите свой вопрос. Команда поддержки ответит вам в этом чате.',
    language: 'Изменить язык', source: 'На основе nessshon/support-bot, автор — Shon Ness. Исходный код оригинала: https://github.com/nessshon/support-bot',
    sent: 'Сообщение отправлено в поддержку. Ожидайте ответа.', sentToUser: 'Ответ доставлен пользователю.',
    edited: 'Изменения видны только в вашем чате. Отправьте исправление новым сообщением, чтобы поддержка его получила.',
    notSetup: 'Поддержка ещё не настроена. Свяжитесь с командой через другой доступный канал.',
    copyFailed: 'Не удалось скопировать сообщение. Отправьте его ещё раз как текст или обычный файл.',
    deliveryFailed: 'Не удалось передать сообщение в поддержку. Попробуйте позже.',
    groupFailed: 'Ошибка доставки. Проверьте группу поддержки и права бота, затем повторите попытку.',
    blocked: 'Ответ не доставлен. Возможно, пользователь заблокировал бота или удалил аккаунт.',
    adminOnly: 'Только администраторы группы могут менять настройки поддержки.',
    banned: 'Пользователь заблокирован. Его сообщения больше не будут поступать сюда.',
    unbanned: 'Пользователь разблокирован. Его сообщения снова будут поступать сюда.',
    silentOn: 'Тихий режим включён. Ответы остаются в теме; пользователь по-прежнему может писать в поддержку.',
    silentOff: 'Тихий режим выключен. Ответы будут доставляться пользователю.',
    stopped: 'Пользователь остановил бота.', restarted: 'Пользователь снова запустил бота.',
    started: 'Пользователь {name} запустил(а) бота!',
    guidance: 'Список доступных команд:\n\n• /ban\n<b>Заблокировать/Разблокировать пользователя</b>\n<blockquote>Заблокируйте пользователя, если не хотите получать от него сообщения.</blockquote>\n\n• /silent\n<b>Активировать/Деактивировать тихий режим</b>\n<blockquote>При включённом тихом режиме сообщения не отправляются пользователю.</blockquote>\n\n• /information\n<b>Информация о пользователе</b>\n<blockquote>Получить сообщение с основной информацией о пользователе.</blockquote>',
    contact: 'Обращение в поддержку', fullName: 'Имя', username: 'Имя пользователя', telegramId: 'Telegram ID',
    telegramLanguage: 'Язык Telegram', languageLabel: 'Язык', firstContact: 'Первое обращение', status: 'Статус',
    lastInbound: 'Последнее входящее', lastOutbound: 'Последнее исходящее', bannedLabel: 'Блокировка', silentLabel: 'Тихий режим', topicId: 'ID темы',
    botStatus: 'Доступность бота', yes: 'Да', no: 'Нет', open: 'Открыто', closed: 'Закрыто',
    ownerOnly: 'Рассылки доступны только настроенному владельцу бота.',
    newsletter: 'Рассылки', newNewsletter: 'Новая рассылка', cancel: 'Отмена', back: 'Назад',
    compose: 'Отправьте сообщение для рассылки: текст, фото, видео или другое копируемое сообщение. Команда /cancel отменит черновик.',
    buttonsPrompt: 'Кнопки со ссылками: по одной на строку, в формате Название | https://example.com. Отправьте /skip, чтобы пропустить.',
    buttonsInvalid: 'Формат: Название | https://example.com, до 8 строк. Разрешены только HTTPS-ссылки.',
    preview: 'Предпросмотр сообщения выше. Подтвердите отправку зарегистрированным пользователям, которым доступна рассылка.',
    previewButton: 'Предпросмотр', edit: 'Заменить сообщение', send: 'Отправить сейчас', schedule: 'Выбрать время',
    datePrompt: 'Отправьте дату в UTC: ГГГГ-ММ-ДД ЧЧ:ММ. В это время откройте /newsletter и нажмите «Отправить сейчас». Автоматической отправки нет.',
    dateInvalid: 'Введите корректное будущее время UTC, например 2027-01-20 14:30.',
    progress: 'Доставлено: {sent}. Ошибок: {failed}. Неизвестно: {uncertain}. Осталось: {pending}.',
    continue: 'Отправить следующую партию', complete: 'Рассылка завершена.', cancelled: 'Рассылка отменена.',
    busy: 'Идёт отправка. Повторите попытку чуть позже.', notDue: 'Время отправки ещё не наступило: {time} UTC.',
    rateLimited: 'Лимит Telegram. Повторите через {seconds} сек.',
    stale: 'Это действие больше недоступно. Откройте /newsletter снова.',
    draftFailed: 'Не удалось скопировать исходное сообщение. Замените его перед отправкой.',
    saved: 'Черновик №{id} · {state}', readyAt: 'Можно отправить с {time} UTC. Откройте /newsletter в это время.',
    empty: 'Рассылок пока нет.',
  },
};

export function t(language, key, values = {}) {
  const value = messages[locale(language)][key];
  if (typeof value !== 'string') throw new Error(`Missing translation: ${key}`);
  return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

export function privateCommands(language, owner = false) {
  const ru = locale(language) === 'ru';
  return [
    { command: 'start', description: ru ? 'Начать общение' : 'Start a conversation' },
    { command: 'language', description: ru ? 'Изменить язык' : 'Choose language' },
    { command: 'source', description: ru ? 'Исходный проект' : 'Original source project' },
    ...(owner ? [{ command: 'newsletter', description: ru ? 'Управление рассылками' : 'Manage newsletters' }] : []),
  ];
}

export function groupCommands(language) {
  const labels = locale(language) === 'ru'
    ? ['Информация о пользователе', 'Заблокировать / разблокировать', 'Включить / выключить тихий режим', 'Закрыть обращение', 'ID группы']
    : ['Contact information', 'Ban / unban user', 'Toggle silent mode', 'Close conversation', 'Group ID'];
  return ['information', 'ban', 'silent', 'close', 'id'].map((command, i) => ({ command, description: labels[i] }));
}
