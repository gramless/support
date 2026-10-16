import { acknowledge, languageCallback } from '../lib/interface.js';
import { newsletterCallback } from '../lib/newsletter.js';

export default async function (call) {
  if (!await acknowledge(call)) return;
  if (call.data.startsWith('language:')) return languageCallback(call);
  if (call.data.startsWith('nl:')) return newsletterCallback(call);
}
