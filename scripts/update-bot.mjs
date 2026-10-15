import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveToken } from '../node_modules/@tgcloud/cli/src/core/credentials.js';
import { runCloud, runtimeSources } from './cloud.mjs';
import { releaseVersion } from '../tgcloud/lib/version.js';
import { installRelease } from './update-deployment.mjs';

const manual = !process.env.REQUEST_ID;
const id = process.env.REQUEST_ID || randomUUID();
const tag = process.env.RELEASE_TAG;
if (!/^[0-9a-f-]{36}$/.test(id || '') || !releaseVersion(tag)) throw new Error('Invalid update request');

if (manual) {
  // Browser dispatch is authorized by GitHub repository write permission, not a Telegram callback.
  const prepare = `import { db } from 'sdk';
export default async function ({id, tag}) {
  const setting = async key => (await db.get('SELECT value FROM support_config WHERE key = :key', {':key':key}))?.value;
  const notice = JSON.parse(await setting('release_notified') || 'null');
  const topic = JSON.parse(await setting('release_topic') || 'null');
  const group = Number(await setting('support_group_id'));
  if (!Number.isSafeInteger(group) || group >= 0 || !Number.isSafeInteger(topic?.thread) || topic.thread <= 1
    || !notice || notice.version !== tag || topic.group !== group || notice.group !== group) throw new Error('No matching current release notice');
  const value = JSON.stringify({id,tag,group,thread:topic.thread,message:notice.message,
    language:await setting('staff_language') || 'en',state:'queued'});
  const result = await db.run("INSERT INTO support_config (key,value,updated_at) VALUES ('update_request',:value,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(support_config.value,'$.state') IN ('done','failed')", {':value':value});
  if (!result.rowsAffected) throw new Error('An update is already queued or running');
}`;
  await runCloud(prepare, { id, tag });
}

const claim = `import { db } from 'sdk';
export default async function ({id, tag}) {
  const row = await db.get("SELECT value FROM support_config WHERE key = 'update_request'");
  const request = JSON.parse(row?.value || 'null');
  if (!request || request.id !== id || request.tag !== tag || request.state !== 'queued') throw new Error('No matching queued Telegram request');
  const result = await db.run("UPDATE support_config SET value = json_set(value, '$.state', 'running'), updated_at = unixepoch() WHERE key = 'update_request' AND value = :previous", {':previous':row.value});
  if (!result.rowsAffected) throw new Error('Update already claimed');
  return {claimed:true};
}`;
await runCloud(claim, { id, tag });
let success = false;
try {
  const root = process.argv[2];
  if (!root) throw new Error('Release source directory is required');
  const sources = {};
  function read(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) read(join(directory, entry.name), name + '/');
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        if (!/^(schema|handlers\/(message|callback_query|edited_message|my_chat_member)|lib\/[a-z][a-z0-9_]*)\.js$/.test(name)) throw new Error('Unsupported release module');
        sources[name.slice(0, -3)] = readFileSync(join(directory, entry.name), 'utf8');
      } else throw new Error('Unexpected release file');
    }
  }
  read(root);
  const token = await resolveToken();
  await installRelease(sources, tag, token);
  success = true;
  console.log('Deployment completed:', tag);
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exitCode = 1;
} finally {
  const report = `import { api, db } from 'sdk';
import { t } from '../lib/i18n.js';
export default async function ({id, tag, success}) {
  const row = await db.get("SELECT value FROM support_config WHERE key = 'update_request'");
  const request = JSON.parse(row?.value || 'null');
  if (request?.id !== id) throw new Error('Update request changed');
  await db.run("UPDATE support_config SET value = json_set(value, '$.state', :state), updated_at = unixepoch() WHERE key = 'update_request' AND value = :previous", {':state':success?'done':'failed', ':previous':row.value});
  await api.sendMessage({chat_id:request.group, message_thread_id:request.thread,
    text:t(request.language, success?'updateDone':'updateFailed', {version:tag})});
  if (success && request.message) await api.editMessageReplyMarkup({chat_id:request.group, message_id:request.message,
    reply_markup:{inline_keyboard:[[{text:t(request.language,'viewRelease'),url:'https://github.com/gramless/support/releases/tag/'+encodeURIComponent(tag)}]]}});
}`;
  try { await runCloud(report, { id, tag, success }, runtimeSources()); }
  catch { console.error('Could not report to Telegram. Check the deployed version before retrying.'); process.exitCode = 1; }
}
