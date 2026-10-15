import { runCloud, runtimeSources } from './cloud.mjs';

const source = `import { api, db } from 'sdk';
import { privateCommands, groupCommands } from '../lib/i18n.js';
export default async function () {
  await db.run('INSERT INTO support_users (user_id) SELECT tg_user_id FROM support_conversations WHERE tg_user_id > 0 ON CONFLICT(user_id) DO NOTHING');
  const owner = await db.get("SELECT value FROM support_config WHERE key = 'owner_id'");
  let ownerMenu = 'not configured';
  for (const language of ['', 'en', 'ru']) {
    await api.setMyCommands({scope: {type: 'all_private_chats'}, language_code: language, commands: privateCommands(language)});
    await api.setMyCommands({scope: {type: 'all_group_chats'}, language_code: language, commands: groupCommands(language)});
    if (owner) {
      try { await api.setMyCommands({scope: {type: 'chat', chat_id: Number(owner.value)}, language_code: language, commands: privateCommands(language, true)}); ownerMenu = 'installed'; }
      catch (error) { if (error.code !== 400 || !/chat not found/i.test(error.description || '')) throw error; ownerMenu = 'owner must start the bot first'; }
    }
  }
  return {commandMenus: 'installed', ownerMenu};
}`;
try { console.log(await runCloud(source, {}, runtimeSources())); }
catch (error) { console.error(error.message); process.exitCode = 1; }
