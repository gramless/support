# Current state

Reference workflows are adapted to TGCloud: persistent language selection,
localized support/menus, source/id/information commands, optional pins/icons,
delivery/edit/status notices, service cleanup and owner newsletter drafts/batches.
Automatic scheduling, album aggregation and timed deletion have documented native
adaptations; no external infrastructure was added.

Four functional handlers and the additive database schema have passed deployment
validation. Bot-facing text is English/Russian. Closing preserves native Telegram
notifications and never posts a separate close acknowledgement into the topic.

Each installation must link its own bot, apply reviewed migrations, configure its
support group and optionally an owner, then install command menus. No deployed
credentials or platform snapshots are part of the repository. Live Telegram
workflows and newsletters require a separate test bot and consented audience.

The repository includes GitHub issue forms, contribution/security guidance and
credential-free CI. Fresh-clone checks do not depend on cached TGCloud capabilities.

Release notification logic is deployed. The scheduled GitHub Action checks daily
at 08:00 UTC when TGCLOUD_TOKEN is configured, compares the actual deployed version,
and posts newer stable versions into a separate persistent updates topic. The
current installed version is 0.1.0. No release is fabricated to test notifications.
