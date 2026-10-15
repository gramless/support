import { handleMessage } from '../lib/support.js';

export default async function (message, ctx) {
  if (ctx?.update && !ctx.update.message) return;
  return handleMessage(message);
}
