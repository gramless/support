# Gramless Support

Based on [nessshon/support-bot](https://github.com/nessshon/support-bot) by Shon Ness,
adapted for Telegram Serverless. The upstream MIT notice is preserved in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Customer support through private messages and forum topics, with English/Russian
language selection and an owner newsletter interface. Everything runs on TGCloud;
Telegram is the user and operator interface.

## Features

- English/Russian selection on `/start`; persistent preference and `/language`.
- One conversation and forum topic per numeric Telegram user ID.
- Native media copying both ways, preserving captions and formatting.
- Profile/title refresh, deleted-topic recovery, close and reopen.
- `/information` (also `/info`), `/ban`, `/silent`, `/close`, and group `/id`.
- `/source` credits the original project; English/Russian command menus.
- Delivery confirmations, private edit notices, bot block/unblock topic notices.
- Metadata and silent notices pinned when permitted; mapped service-message cleanup.
- Closing uses Telegram's native notification. Close/reopen notices are preserved;
  bot availability notifications do not post into closed conversations.
- New topics open with the reference-style linked-user announcement and command
  explanations, followed by compact contact metadata. `/information` shows full details.
- Optional verified topic emoji and configurable staff-notification language.
- Owner newsletters: media drafts, HTTPS buttons, preview, confirmation, recipient
  snapshots, cancellation, history, progress and resumable batches.
- Daily GitHub release checks with a dedicated update-notification topic.

Current human group membership is checked for replies. Administrative commands
require administrator/owner status. Unrelated groups, General, unmapped topics,
bots, anonymous senders and staff commands cannot become customer replies.

## Requirements and installation

- Node.js 24+ and npm for development; a bot with Telegram Serverless enabled.
- A private, forum-enabled supergroup with the bot as administrator.
- Manage Topics and Delete Messages rights; Pin Messages is optional.

```sh
git clone https://github.com/gramless/support.git
cd support
npm ci
npm run check
npm test
```

There are no runtime npm dependencies, Redis, Docker, polling, separate backend,
workers, Mini App or dashboard. The CLI is a pinned development dependency.

## Telegram setup and deployment

Create a bot in [@BotFather](https://t.me/BotFather), enable Serverless, and obtain
its **CLI access token** from Serverless → CLI Access. This differs from the Bot
API token. Add the bot to your private forum supergroup. All human group members
are trusted operators. Administrators receive ordinary group messages even with
bot privacy mode enabled. Anonymous staff replies are ignored.

For a fresh deployment:

```sh
npx tgcloud login
npx tgcloud migrate --dry-run --local
npx tgcloud migrate --safe --local
npx tgcloud push
npx tgcloud migrate --dry-run
```

Review the dry-run first. `--safe` applies additive changes only. Migrating locally
before deployment prevents handlers from seeing missing tables. Each bot has its
own database; create its schema before enabling support traffic.

Configure your actual IDs (replace the examples):

```sh
npm run configure -- -1001234567890 --owner=123456789 --language=en
npm run setup:commands
npm run verify:cloud
npx tgcloud webhook
```

`--owner` grants newsletter access to that numeric Telegram user. Have the owner
start the bot before installing their command menu. Omit `--owner` if you do not
need newsletters. Obtain the group ID by sending `/id` in the support group.

You can update owner, staff language and topic icon independently:

```sh
npm run configure -- --owner=123456789 --language=ru
npm run configure -- --emoji=off
```

To enable an icon, use `--emoji=<custom-emoji-id>` from Telegram's
`getForumTopicIconStickers` result. Configuration verifies it against that list;
keep the ID as a string. Group setup validates private/forum status and bot rights.
Existing mapped conversations cannot move to another group without a reviewed
migration; unmapped reservations can be repaired safely.

TGCloud 0.2.0 has no documented runtime environment configuration API. Settings
live in `support_config`: `support_group_id`, `owner_id`, `staff_language` (default
English), and optional `topic_emoji_id`. `.tgcloud/` credentials are ignored.
Use the `TGCLOUD_TOKEN` CI secret when needed. No public setup endpoint exists.

## Language and conversation controls

| Where | Input | Behavior |
| --- | --- | --- |
| Private | `/start` | First-use language picker, then support instructions |
| Private | `/language` | Change the saved English/Russian preference |
| Private | `/source` | Original project attribution and link |
| Private | Normal message | Create/reuse topic, copy, update a reusable receipt |
| Topic | `/information`, `/info` | Profile, IDs, languages, times, flags and state |
| Topic | `/ban` | Toggle inbound blocking; operator replies remain possible |
| Topic | `/silent` | Toggle outbound suppression; user messages still arrive |
| Topic | `/close` | Close conversation/topic; next inbound reopens it |
| Group | `/id` | Display group ID without relaying to a customer |
| Owner private | `/newsletter` | Draft, preview, send or resume a newsletter |
| Owner private | `/cancel` | Discard the current unsent draft |

`/start`, `/language` and `/source` don't create support topics. A user can send a
question without choosing a language; their Telegram locale supplies the fallback.
The choice is independent of later profile changes. All translations and command
descriptions live in `tgcloud/lib/i18n.js`. Staff responses use the operator's
selected/Telegram locale; metadata and lifecycle notices use `staff_language`.

Private edits produce a localized notice asking for a new correction message.
Edited content is never copied again; group-side edits are ignored. Private
receipts reuse one message instead of a deletion timer. Operator success notices
use Telegram ephemeral messages visible to that operator; Telegram does not
guarantee delivery to offline recipients.

## Newsletters

Only the configured owner can create, inspect, cancel or send newsletters.
Choose **New newsletter**, send copyable text/media, then enter optional buttons:
`Label | https://example.com`, one per line (up to eight), or `/skip`. Preview
before choosing **Send now**. Content can be replaced before sending. Keep the
source message in the owner's chat until delivery finishes.

Confirmation snapshots eligible registered recipients. Banned users, users who
stopped the bot, and the owner are excluded; eligibility is rechecked at delivery.
Each click sends at most five recipients. Use **Send next batch** until finished.
State survives restarts; one active newsletter per owner is enforced. The latest
ten entries are shown in history; cancellation preserves the entry.

**Choose a time** saves a future UTC time. Unlike the upstream scheduler, sending
is not automatic: reopen `/newsletter` then and press Send now. TGCloud exposes no
documented timer/scheduler in this runtime, and this project runs no worker.
Rate-limit retry times persist. Interrupted/ambiguous sends become **uncertain**
rather than being blindly resent. Progress separates sent, failed, uncertain and
pending recipients. A missing source stops the batch with explicit failures.

## Daily release notifications

The **Release updates** GitHub Action checks stable releases of `gramless/support`
daily at **08:00 UTC** (12:00 in Tbilisi). It can also be run manually from Actions.
When a release is newer than the deployed bot, it creates a dedicated updates
topic in the configured support group and posts the installed/new versions with a
link to the release notes. Later notices reuse that topic; successful announcements
are remembered so the same version is not posted every day. These are notices only,
not automatic installation or migration.

For your own deployment, fork this repository, enable GitHub Actions, and add your
bot's CLI access token as the **`TGCLOUD_TOKEN` repository Actions secret**. Deploy
the bot and configure the support group first. Without the secret the workflow
skips notification checks. Never put the token in a workflow file or Git commit.

```sh
npm run check:updates
```

The local command uses your saved CLI credentials. It reads `lib/version` from
the actual deployed module snapshot; it does not assume that the latest source
checkout is already installed. Stable release tags must be `X.Y.Z` or `vX.Y.Z`.
Drafts, prereleases and the absence of releases produce no notice. GitHub may delay
scheduled runs; monitor the workflow in Actions if a daily check is important.

The short scheduled Action is needed because this TGCloud runtime has no documented
scheduler. Notification logic uses only the native SDK and existing database;
there is no bot worker or public scheduling endpoint. `support_config` stores the
updates topic/group, last announced version and an expiring concurrent-check lease.
Missing topics are replaced and closed update topics are reopened when a new
release needs announcing. Customer support topics are never used for these notices.

## Storage, safety and platform differences

`support_conversations` retains existing columns, constraints and indexes, adding
only `silent_notice_id`. It stores routing/profile data, flags, metadata IDs and
timestamps. `created_at` is first support contact; `last_in_at` includes banned
contact, while `last_out_at` changes only after successful replies. Times use UTC.

`support_users` stores selected language, bot availability, interface message IDs
and registration time. `support_newsletters` stores source-message IDs, link
buttons, state, due/retry times and a short batch lease. Recipient rows store
delivery state. No media bytes or customer message bodies enter these tables.
Metadata has no automatic expiry; Telegram copies follow chat retention settings.
`setup:commands` also registers existing conversations without replacing their data.

First contact reserves a unique negative thread ID before calling Telegram. A
conditional update adopts one topic; racing invocations delete their unused ones.
Only threads greater than 1 route. Legacy global thread uniqueness is retained,
so use one support group per deployment. IDs follow the Bot API's
[52-bit guarantee](https://core.telegram.org/bots/api#user), with SQLite INTEGER
storage and safe-number validation.

The reference's Python/aiogram/Redis architecture, in-memory throttling, album
aggregation, automatic scheduling and timed deletions are adapted to native
handlers and persistent state. Album items copy individually. Cross-chat reply IDs
are not reused. Unsupported paid media, invoices, giveaways and service content
are not relayed. Raw private updates/errors are not sent to a developer chat.

Telegram and SQLite cannot commit atomically. A crash during topic adoption can
leave an unmapped provisional topic; support-message redelivery can duplicate a
copy or repeat a toggle. Newsletter token leases prevent concurrent batches;
uncertain recipient states prevent automatic retries of interrupted deliveries.

## Development and validation

Runtime is under `tgcloud/`. Functional handlers: `message`, `callback_query`,
`edited_message` (private notice only), and `my_chat_member` (bot availability).
See the [SDK reference](docs/tgcloud-sdk.md) and
[official Serverless documentation](https://core.telegram.org/bots/serverless).

```sh
npm run check
npm test
npx tgcloud push
npx tgcloud migrate --dry-run
npm run verify:cloud
```

`check` validates syntax/imports/handler names. Tests execute production SQL and
routing on real local SQLite with mocked Telegram transport, including language,
callback ownership, topic races, permissions, media, pins and newsletter recovery.
No separate linter/typechecker is configured. Cloud no-op runs validate module
loading; `verify:cloud` checks real database constraints and group permissions.
Operational scripts use pinned CLI internals; review them when upgrading it.
When preparing a release, bump both `package.json` and `tgcloud/lib/version.js`;
`npm run check` verifies they agree. Publish the matching GitHub release tag after
reviewing changes and migrations. Each operator chooses when to deploy it.

Live Telegram behavior is unverified. After setup, test both languages, two users'
text/media, operator replies, `/information`, ban/silent, close/reopen, topic
deletion/recovery, pins, edit notices, bot stop/restart and anonymous-message
exclusion. Use a separate test bot and consented small audience for newsletters;
check preview, sending, resume, cancellation and progress. No live newsletter was
sent during validation.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Use the
[bug report](https://github.com/gramless/support/issues/new?template=bug_report.yml)
or [feature request](https://github.com/gramless/support/issues/new?template=feature_request.yml)
forms for reproducible problems and proposed improvements. Report vulnerabilities
privately using [SECURITY.md](SECURITY.md).

[MIT](LICENSE), with the [upstream notice](THIRD_PARTY_NOTICES.md) preserved.

Gramless is an independent open-source project and is not affiliated with or endorsed by Telegram.
