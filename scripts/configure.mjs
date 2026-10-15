import { runCloud, groupValidation } from './cloud.mjs';
import { telegramId } from '../tgcloud/lib/format.js';
import { languages } from '../tgcloud/lib/i18n.js';

const args = process.argv.slice(2);
const positional = args.filter(value => !value.startsWith('--'));
const options = {};
for (const argument of args.filter(value => value.startsWith('--'))) {
  const match = /^--(owner|language|emoji)=(.+)$/.exec(argument);
  if (!match || options[match[1]] !== undefined) throw new Error('Use --owner=<user-id>, --language=en|ru, or --emoji=<icon-id>|off.');
  options[match[1]] = match[2];
}
const group = positional.length ? telegramId(positional[0]) : null;
const owner = options.owner !== undefined ? telegramId(options.owner) : null;
if (positional.length > 1 || (positional.length && (!group || group >= 0))
  || (options.owner !== undefined && (!owner || owner <= 0))
  || (options.language !== undefined && !Object.hasOwn(languages, options.language))
  || (options.emoji !== undefined && options.emoji !== 'off' && !/^\d{1,20}$/.test(options.emoji))
  || (!args.length)) {
  console.error('Usage: npm run configure -- [negative-group-id] [--owner=user-id] [--language=en|ru] [--emoji=icon-id|off]');
  process.exit(1);
}
const source = `import { api, db } from 'sdk';
export default async function ({group, owner, language, emoji}) {
  if (group) {
    ${groupValidation}
    const existing = await db.get('SELECT count(*) AS n FROM support_conversations WHERE topic_chat_id != :group AND message_thread_id > 1', {':group': group});
    if (existing.n) throw new Error('Existing topics belong to another group. Relocation needs a reviewed data migration.');
  }
  if (emoji && emoji !== 'off') {
    const icons = await api.getForumTopicIconStickers();
    if (!icons.some(icon => icon.custom_emoji_id === emoji)) throw new Error('Choose a custom emoji ID returned by getForumTopicIconStickers.');
  }
  const values = [];
  if (group) values.push(['support_group_id', String(group)]);
  if (owner) values.push(['owner_id', String(owner)]);
  if (language) values.push(['staff_language', language]);
  if (emoji !== null) values.push(['topic_emoji_id', emoji === 'off' ? '' : emoji]);
  for (const [key, value] of values) await db.run('INSERT INTO support_config (key, value, updated_at) VALUES (:key, :value, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', {':key': key, ':value': value});
  if (group) await db.run('UPDATE support_conversations SET topic_chat_id = :group WHERE message_thread_id < 0', {':group': group});
  return {configured: values.map(([key]) => key)};
}`;
try {
  console.log(await runCloud(source, { group, owner, language: options.language || null, emoji: options.emoji ?? null }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
