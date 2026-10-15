import { telegramId } from '../lib/format.js';
import { receipt } from '../lib/interface.js';

export default async function (message) {
  if (message?.chat?.type !== 'private' || message.from?.is_bot !== false
    || telegramId(message.from.id) <= 0 || message.chat.id !== message.from.id) return;
  return receipt(message.from, 'edited');
}
