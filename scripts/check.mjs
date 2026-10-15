import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { VERSION } from '../tgcloud/lib/version.js';

if (JSON.parse(readFileSync('package.json', 'utf8')).version !== VERSION) {
  throw new Error('package.json and tgcloud/lib/version.js versions must match');
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}

const runtime = files('tgcloud').filter(file => file.endsWith('.js'));
const capabilities = existsSync('.tgcloud/capabilities.json')
  ? JSON.parse(readFileSync('.tgcloud/capabilities.json', 'utf8')) : null;
// A fresh clone has no private CLI cache. These documented update types are the
// project's supported handlers; a linked platform descriptor takes precedence.
const allowed = capabilities?.directories.find(dir => dir.name === 'handlers').allowed_names
  || ['message', 'callback_query', 'edited_message', 'my_chat_member'];
for (const file of [...runtime, ...files('scripts'), ...files('tests')].filter(file => /\.m?js$/.test(file))) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const file of runtime) {
  if (file.includes('handlers') && !allowed.includes(file.split(/[\\/]/).at(-1).slice(0, -3))) {
    throw new Error(`Unsupported handler: ${file}`);
  }
  for (const [, source] of readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (source !== 'sdk' && !source.startsWith('sdk/') && !(source.startsWith('.') && source.endsWith('.js'))) {
      throw new Error(`Unsupported runtime import: ${source}`);
    }
  }
}
console.log(`Syntax and platform import/handler checks passed (${runtime.length} runtime modules).`);
