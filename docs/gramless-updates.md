# Gramless Updates

[Gramless Updates](https://github.com/apps/gramless-updates) is one GitHub App for
the Gramless ecosystem. Support is its first adapter. Other projects can use the
same app identity without depending on the Support repository at runtime.

## Shared app registration

Owner: `gramless`. Public client ID: `Iv23lirP23YIRgenKbeN` (not a secret).
Permissions: repository Actions write and Metadata read. Device flow must be
enabled; keep expiring user tokens enabled. Webhooks, a callback server, an app
private key and a client secret are not needed for this device-flow integration.
Use `https://github.com/gramless` as the app homepage to represent all projects.

Install the app only on selected workflow repositories. Each deployment uses its
own `TGCLOUD_TOKEN` repository secret. Never share that secret across bot instances
or put the app's private key into a deployed bot.

## Integration contract for another project

Each project supplies its own release repository, module/schema validation and
deployment workflow. Support's `update-bot.yml` intentionally accepts Support
releases; copying it unchanged will not turn it into another project's updater.

1. A bot owner selects their workflow repository. Resolve its numeric repository
   ID; Support's device adapter currently resolves public repository metadata.
2. Start GitHub device flow with the shared public client ID. Send the code only
   to the owner's private chat. Persist ownership, code expiry, next permitted
   check and the message ID. Never display the device secret.
3. A deliberate button click checks authorization after GitHub's minimum interval.
   Include `repository_id` in the token exchange. Handle pending, slow_down,
   rejection and expiry without a worker or polling loop.
4. Store a short-lived token bound to that owner and repository in the deployment's
   private settings. Do not retain the refresh token. Changing owner/repository
   invalidates reuse. Ask the owner to reconnect after expiration.
5. Persist a unique selected-version update request before dispatching a fixed
   workflow in that repository. Match callbacks to the current release notice;
   reject other users, chats, topics, messages and stale versions.
6. The workflow verifies and atomically claims the request, resolves a published
   stable release to a commit, and validates that project's source layout/version.
   The browser route may rely on GitHub repository write authorization instead.
7. Check the real schema diff and deployed revision. Refuse unsafe changes; deploy
   with the expected revision and report the result through Telegram. Never reset
   an ambiguous dispatch or retry a possibly accepted deployment blindly.

GitHub authorization grants the intersection of the app's permissions and the
authorizing user's access. An installation is not a central deployment service:
the workflow repository's secret controls exactly which bot it can deploy.
Repository maintainers and published release authors remain trusted. Keep each
project independently deployable; do not import code from sibling repositories.

## Support adapter

- `tgcloud/lib/github-auth.js`: device flow and scoped short-lived authorization.
- `tgcloud/lib/updater.js`: owner controls, phone/CLI screens and persisted dispatch.
- `scripts/setup-updates.mjs`: CLI repository selection, disconnect and reviewed reset.
- `.github/workflows/update-bot.yml`: GitHub-authorized runner for Telegram/browser requests.
- `scripts/update-bot.mjs` and `update-deployment.mjs`: claims, version/schema/revision checks and reporting.

The release-notification workflow still runs only on stable release publication.
Deployment is a separate explicit workflow dispatch, never an automatic consequence
of publishing a release. The bot offers phone-browser and terminal instructions.

## Official references

- [GitHub App device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)
- [GitHub App registration](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
- [Run a workflow from a browser](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
