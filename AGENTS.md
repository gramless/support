# Gramless Support

Read `docs/ai/INDEX.md` first. This adapts nessshon/support-bot to TGCloud.
Preserve top-of-README attribution and the upstream MIT notice.

Runtime belongs in `tgcloud/`; only SDK and relative `.js` imports work there.
Handlers receive payload as the first argument; `ctx.update` is optional for CLI.
Functional handlers: message, callback_query, edited_message (private notice,
never edit relaying), and my_chat_member (private bot availability).

Read SDK docs/capabilities before changing platform behavior. No Node/npm runtime
dependencies, assumed timers/transactions, workers or scheduler. Persist routing,
locale and newsletter state. UI strings belong in `lib/i18n.js`.

Preserve deployed data/schema. All DB methods are async and SQL is bound.
Negative thread IDs reserve first contact; only threads > 1 route. Keep conditional
topic adoption, loser cleanup, and newsletter ownership/lease/recipient checks.
Never route by username or blindly retry ambiguous sends.

Node 24+: `npm run check`, `npm test`. Review `migrate --dry-run --local` before
additive `migrate --safe --local`, then deploy and check the deployed schema diff.
Never apply destructive migrations or send a live newsletter for validation.
Secrets stay in `.tgcloud/`. Configuration is CLI-authenticated, never public.
