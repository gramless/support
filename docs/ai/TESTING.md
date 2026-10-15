# Validation

Node 24+. `npm ci`, `npm run check` and `npm test` work without Telegram credentials
or `.tgcloud/` state, and run in GitHub Actions on pushes and pull requests.

- npm run check: JS syntax, SDK/local imports, supported handler names.
- npm test: actual SQLite executes production SQL against tests/schema.sql;
  registerHooks replaces SDK transport. Covers support/topic races, language,
  callback ownership, permissions, media, lifecycle/pinning, newsletter snapshot,
  lease recovery, rates, uncertainty, cancellation and missing sources.
- migrate --dry-run --local reviews additions; migrate --safe --local applied only
  additive changes this session. push deploys thirteen modules/four handlers.
- migrate --dry-run confirms deployed schema equals the actual DB.
- npm run setup:commands installs real command menus and registration backfill;
  never sends messages. Owner scope needs owner_id and a private bot chat.
- tgcloud run handlers/<name> '{}' checks loading for all four handlers, no sends.
- npm run verify:cloud checks actual SDK/SQLite constraints and group permissions
  for the linked deployment; it needs that deployment's credentials and settings.
- New newsletter uniqueness indexes were inspected in actual sqlite_master.
- Release tests cover stable version ordering, deduplication, concurrent checks,
  topic recovery and failures. npm run check:updates exercises the real deployed
  version lookup and GitHub HTTP path; no synthetic release is used for live sends.
- Update tests cover owner/topic/message authorization, persisted dispatch claims,
  ambiguous requests, schema/module-removal refusal, revision checking and ambiguous
  deploy readback. Device tests cover private ownership, intervals, expiry and
  repository-bound tokens. A full Telegram-to-Actions deployment needs device
  authorization and a newer published release; mocked checks do not prove that path.

No separate formatter/linter/typechecker. Mock transport tests and real cloud
loading/schema checks do not prove live Telegram delivery. Use a separate bot and
consented audience for newsletter smoke tests. Never send a live newsletter during
automated validation or insert fake conversations into the deployed DB.
