import { readFileSync, readdirSync } from 'node:fs';
import { runCloud, groupValidation } from './cloud.mjs';

function modules(dir = 'tgcloud') {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = dir + '/' + entry.name;
    return entry.isDirectory() ? Object.entries(modules(path))
      : path.endsWith('.js') ? [[path.slice(8, -3), readFileSync(path, 'utf8')]] : [];
  }));
}
const source = `import { api, db } from 'sdk';
import { supportConversations, supportConfig, supportUsers, supportNewsletters, supportNewsletterRecipients } from '../schema.js';
export default async function () {
  const counts = await db.get('SELECT count(*) AS conversations FROM support_conversations');
  const users = await db.get('SELECT count(*) AS registered FROM support_users');
  const newsletterIndexes = await db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('uidx_newsletter_active_owner', 'uidx_newsletter_recipient')");
  const duplicates = await db.all('SELECT tg_user_id FROM support_conversations GROUP BY tg_user_id HAVING count(*) > 1');
  const ambiguous = await db.all('SELECT topic_chat_id, message_thread_id FROM support_conversations WHERE message_thread_id > 1 GROUP BY topic_chat_id, message_thread_id HAVING count(*) > 1');
  const setting = await db.get("SELECT value FROM support_config WHERE key = 'support_group_id'");
  const group = Number(setting?.value);
  let setup;
  try { ${groupValidation} setup = {ready: true}; }
  catch (error) { setup = {ready: false, code: error.code || null, reason: error.code ? 'Configured group is inaccessible or lacks the required Telegram permissions.' : error.message}; }
  const owner = await db.get("SELECT value FROM support_config WHERE key = 'owner_id'");
  return {schemaLoaded: !!supportConversations && !!supportConfig && !!supportUsers && !!supportNewsletters && !!supportNewsletterRecipients,
    counts: {...counts, ...users}, newsletterConstraints: newsletterIndexes.length === 2, ownerConfigured: !!owner,
    uniqueUsers: duplicates.length === 0, uniqueTopics: ambiguous.length === 0, setup};
}`;
try {
  // This source is executed by the authenticated CLI /run API and is never deployed.
  const result = await runCloud(source, {}, modules());
  console.log(JSON.stringify(result, null, 2));
  if (!result.setup.ready || !result.uniqueUsers || !result.uniqueTopics || !result.newsletterConstraints) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
