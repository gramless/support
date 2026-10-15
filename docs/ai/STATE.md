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

Release notification logic is deployed. The GitHub Action runs only on release
publication, skips prereleases, compares the actual deployed version, and posts
newer stable versions into a separate persistent updates topic when TGCLOUD_TOKEN
is configured. Source and linked deployment version are 1.0.0; updater additions
are newer than the published v1.0.0 tag. Release checks have no scheduled or manual
workflow trigger; deployments use a separate explicit dispatch workflow.

Gramless Updates is registered under gramless with Actions write/Metadata read.
It is shared across projects; Support is the first adapter. Phone/CLI screens,
private device authorization and migration-free revision-checked update tooling
are implemented. Device flow was initially disabled in the app registration;
owner must enable it. No live authorization/deployment through this app has been
verified. Do not claim other projects are already integrated.
