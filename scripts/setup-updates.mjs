import { runCloud } from './cloud.mjs';

const repository = process.argv[2];
if (!['off', 'reset'].includes(repository) && !/^[\w-]+\/[\w.-]+$/.test(repository || '')) {
  console.error('Usage: npm run setup:updates -- owner/repository | off | reset');
  process.exit(1);
}
const source = `import { db } from 'sdk';
export default async function ({repository}) {
  if (repository === 'reset') {
    await db.run("UPDATE support_config SET value = json_set(value, '$.state', 'failed'), updated_at = unixepoch() WHERE key = 'update_request'");
    return {reset:true};
  }
  const owner = await db.get("SELECT value FROM support_config WHERE key = 'owner_id'");
  if (repository !== 'off' && !owner?.value) throw new Error('Configure owner_id first.');
  const previous = await db.get("SELECT value FROM support_config WHERE key = 'update_repository'");
  const value = repository === 'off' ? '' : repository;
  if (previous?.value !== value || repository === 'off') {
    await db.run("DELETE FROM support_config WHERE key IN ('update_auth', 'update_device', 'update_github_token')");
  }
  await db.run("INSERT INTO support_config (key, value, updated_at) VALUES ('update_repository', :value, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", {':value':value});
  return {repository:value, enabled:Boolean(value)};
}`;
try { console.log(await runCloud(source, { repository })); }
catch (error) { console.error(error.message); process.exitCode = 1; }
