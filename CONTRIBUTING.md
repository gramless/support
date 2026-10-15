# Contributing

Use the bug-report or feature-request form in [Issues](https://github.com/gramless/support/issues).
Describe the Telegram workflow, expected result and steps to reproduce. Discuss
large changes before implementing them so the scope is clear.

## Development

Use Node.js 24 or newer. Fork and clone the repository, then run:

```sh
npm ci
npm run check
npm test
```

Local checks require no bot token, Telegram account or `.tgcloud/` directory.
Tests use real local SQLite with mocked Telegram transport. CI runs the same
checks; it never deploys the bot or sends messages.
The separate scheduled release-notification workflow uses an explicitly configured
CLI secret and posts only newer-release notices; it never runs on pull requests.

Runtime code belongs under `tgcloud/` and can import only the platform SDK and
relative `.js` modules. Keep changes focused, avoid runtime npm dependencies, and
put English/Russian UI strings in `tgcloud/lib/i18n.js`. Preserve upstream credit.

Test meaningful routing, permissions, state transitions and failure handling.
Document observable behavior and platform limits. Keep schema changes additive
where possible; never rebuild or clear a production database to make a test pass.
Use Conventional Commits, such as `fix: preserve topic closure`.

## Telegram testing

Use a separate development bot, private forum group and consented test users.
Follow the README for linking, migrations and configuration. Keep all CLI state
and credentials in ignored `.tgcloud/`; never commit production chat IDs, tokens,
private messages or database snapshots. Do not send a live newsletter as a test
without the recipients' consent.

For a pull request, explain the behavior change and list the checks actually run.
Distinguish local mocked checks, platform validation and live Telegram testing.
Include a sanitized screenshot when it helps explain a UI change.
For a release, keep `package.json` and `tgcloud/lib/version.js` versions aligned
and use a matching stable `vX.Y.Z` GitHub release tag.

Security reports belong in the private process described in [SECURITY.md](SECURITY.md).
