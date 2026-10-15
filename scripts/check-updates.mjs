import { resolveToken } from '../node_modules/@tgcloud/cli/src/core/credentials.js';
import { getFiles } from '../node_modules/@tgcloud/cli/src/api/endpoints.js';
import { runCloud, runtimeSources } from './cloud.mjs';
import { releaseVersion } from '../tgcloud/lib/version.js';

try {
  const deployed = await getFiles(await resolveToken());
  const versionSource = deployed.canonical_modules?.['lib/version'] || '';
  const installedVersion = /export\s+const\s+VERSION\s*=\s*['"]([^'"]+)['"]/.exec(versionSource)?.[1];
  if (!releaseVersion(installedVersion)) throw new Error('Deployed version is unknown. Deploy the current bot before enabling release checks.');
  const source = `import { checkReleases } from '../lib/updates.js';
export default async function ({installedVersion}) { return checkReleases(installedVersion); }`;
  console.log(await runCloud(source, { installedVersion }, runtimeSources()));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
