import { acknowledge, languageCallback } from '../lib/interface.js';
import { newsletterCallback } from '../lib/newsletter.js';
import { updateCallback } from '../lib/updater.js';
import { telegramId } from '../lib/format.js';

export default async function (call) {
  if (typeof call?.id === 'string' && telegramId(call.from?.id) && call.from?.is_bot === false
    && typeof call.data === 'string' && call.data.length <= 64 && await updateCallback(call)) return;
  if (!await acknowledge(call)) return;
  if (call.data.startsWith('language:')) return languageCallback(call);
  if (call.data.startsWith('nl:')) return newsletterCallback(call);
}
