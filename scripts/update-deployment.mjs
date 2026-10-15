import * as platform from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
import { newerRelease } from '../tgcloud/lib/version.js';

export async function installRelease(sources, tag, token, transport = platform) {
  const versionOf = code => /export\s+const\s+VERSION\s*=\s*['"]([^'"]+)['"]/.exec(code || '')?.[1];
  if (versionOf(sources['lib/version']) !== tag.replace(/^v/, '') || !sources.schema
    || !sources['handlers/message'] || !sources['handlers/callback_query']) throw new Error('Incomplete or mismatched release');
  const remote = await transport.getFiles(token);
  if (!Number.isSafeInteger(remote.revision)) throw new Error('Missing deployed revision');
  const installed = versionOf(remote.canonical_modules?.['lib/version']);
  if (!newerRelease(tag, installed)) throw new Error('Selected release is not newer than installed version');
  if (Object.keys(remote.canonical_modules).some(name => !Object.hasOwn(sources, name))) {
    throw new Error('Remote modules would be removed. Review this upgrade through the CLI.');
  }
  const migration = await transport.applyMigration(token, { schema: sources.schema, dry_run: true });
  if (!Array.isArray(migration.db_changes) || migration.db_changes.length) {
    throw new Error('Database migration required. Review and apply through the CLI first.');
  }
  try {
    await transport.batchDeploy(token, { expected_revision: remote.revision,
      manifest: Object.keys(sources), changed_sources: sources });
  } catch (error) {
    // Read authoritative state after an ambiguous deploy; never redeploy blindly.
    const current = await transport.getFiles(token);
    if (Object.keys(current.canonical_modules || {}).length !== Object.keys(sources).length
      || !Object.entries(sources).every(([name, source]) => current.canonical_modules?.[name] === source)) throw error;
  }
  await transport.syncWebhook(token);
}
