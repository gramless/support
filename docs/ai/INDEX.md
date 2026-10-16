# Gramless Support memory

- Reference: nessshon/support-bot; README attribution and THIRD_PARTY_NOTICES.md preserve credit/license.
- Handlers: message (support/private commands), callback_query (language/newsletters), edited_message (private notice), my_chat_member (bot availability).
- Libraries: support.js/store.js/format.js for routing; interface.js/i18n.js for UI; newsletter.js for persisted drafting/batches.
- Schema: support_conversations/config, support_users, support_newsletters, support_newsletter_recipients.
- Read ARCHITECTURE.md for invariants, TESTING.md for checks, STATE.md for setup status.
- SDK: docs/tgcloud-sdk.md; operational scripts and pinned CLI 0.2.0 in package.json.
- Public repository: gramless/support; CONTRIBUTING.md, SECURITY.md and .github/ contain community guidance, issue forms and CI.
- Release notices: lib/updates.js + version.js, scripts/check-updates.mjs and .github/workflows/release-updates.yml (stable release publication only).
