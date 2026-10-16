# Architecture

TGCloud-native adaptation of nessshon/support-bot, with EN/RU selection and owner
newsletters. Four functional handlers process message, callback_query,
edited_message and my_chat_member. Runtime imports SDK/local JavaScript only.

Support upserts one row per numeric Telegram ID. Negative thread ID (-user_id)
reserves first contact without rebuilding the old NOT NULL/UNIQUE schema.
Conditional topic adoption chooses a winner and deletes unused racing topics.
Only mapped threads > 1 in the configured group route. Current human membership
is checked for replies; administrative commands require admin/owner. Silent
blocks outbound, ban blocks inbound. Recovery retries missing/closed topics once,
never permission failures. Legacy global thread uniqueness means one group.

support_users separates selected language from Telegram profile locale, and stores
bot availability/menu/receipt IDs. i18n.js contains complete EN/RU catalogs.
Private receipts reuse a message; operator confirmations are native ephemeral
messages. Callbacks acknowledge first, validate private-chat ownership/payloads,
and reject stale language menus. Edits only produce private correction notices.
Availability persists before notifying an existing topic. Service cleanup never
relays content; human close/reopen events synchronize status. Preserve native
close/reopen notices and send no separate close acknowledgement; bot availability
events must not post into closed conversations. Delayed bot service
updates must not overwrite newer state. Pinning checks rights; emoji IDs are verified.

Every newsletter action checks configured owner_id. Draft/source/button/time state
lives in support_newsletters, with a partial unique index for one active owner
draft. Confirmation snapshots eligible support_users into unique newsletter/user
recipient rows. Batches claim a persisted 60s token lease, renewed per recipient,
and send at most five per click. Eligibility is rechecked. Interrupted/unknown
deliveries become uncertain, never automatically retried. 429 times persist;
due times gate manual sending, not an automatic scheduler. Cancellation keeps history.

support_config exists because this SDK has no documented runtime env API.
Authenticated scripts use pinned CLI run helpers with ephemeral source; no public
setup endpoint. setup:commands installs EN/RU scopes and registers old conversations.

Telegram/DB commits aren't atomic: support redeliveries may duplicate content or
toggles; an adoption crash can leave an orphan provisional topic. The DB stores
metadata/IDs/URL buttons, not private content/media bytes. Albums copy per item;
edits are not synchronized and cross-chat reply IDs aren't reused.

Release publication triggers a short GitHub Actions run; prereleases are skipped.
Release checks have no scheduled/manual trigger. Forks need their own release event
or a local CLI check; upstream release events do not propagate to forks.
The repository secret TGCLOUD_TOKEN authorizes the CLI run API. check-updates.mjs
reads the actual deployed lib/version source before invoking SDK-only updates.js.
GitHub's stable releases/latest is compared numerically; no releases/current versions
produce no topic or notice. The existing support_config table stores a five-minute
check lease, dedicated topic/group and last successfully announced version. It
deduplicates ordinary/concurrent runs and recovers a missing/closed updates topic.
Release notices contain only a release link. There is no GitHub App integration,
device authorization, /updates command or deployment workflow. Upgrades use the CLI.
As with support copies, an ambiguous crash after
Telegram accepted a notice but before the DB acknowledgement may duplicate it.
