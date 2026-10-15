// Operational code only. The CLI is pinned because these helpers are its internal API.
import { resolveToken } from '../node_modules/@tgcloud/cli/src/core/credentials.js';
import { runFunction } from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
import { scanFiles } from '../node_modules/@tgcloud/cli/src/core/scanner.js';
import { readWd } from '../node_modules/@tgcloud/cli/src/core/workdir.js';
import { pathToModule } from '../node_modules/@tgcloud/cli/src/core/snapshot.js';

export function runtimeSources() {
  return Object.fromEntries(scanFiles().map(file => [pathToModule(file), readWd(file)]));
}

export async function runCloud(source, args = {}, sources = {}) {
  const result = await runFunction(await resolveToken(), 'handlers/message',
    { ...sources, 'handlers/message': source }, args, {});
  return result.result;
}

export const groupValidation = `
  const chat = await api.getChat({chat_id: group});
  if (chat.type !== 'supergroup' || !chat.is_forum || chat.username) {
    throw new Error('Choose a private, forum-enabled supergroup.');
  }
  const me = await api.getMe();
  const member = await api.getChatMember({chat_id: group, user_id: me.id});
  if (member.status !== 'administrator' || !member.can_manage_topics || !member.can_delete_messages) {
    throw new Error('The bot needs administrator rights to manage topics and delete unused racing topics.');
  }
`;
