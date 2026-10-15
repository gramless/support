# Security policy

Security fixes target the current `main` branch. Older snapshots do not have a
separate maintenance policy.

## Reporting a vulnerability

Use GitHub's private [Report a vulnerability](https://github.com/gramless/support/security/advisories/new)
form. Include the affected revision, reproduction steps, impact and a minimal
sanitized example. Routing leaks, permission bypasses, unauthorized newsletters
and credential exposure are security issues.

Do not open a public issue containing exploit details, bot/CLI tokens, private
messages, production IDs or database records. If the private reporting form is
unavailable, contact a maintainer through their GitHub profile to arrange a
private channel before sharing details.

If a bot/CLI token has leaked, revoke it in BotFather immediately. Revoke GitHub
tokens through GitHub settings. Removing a token from a
message or commit does not revoke access. Notify the deployment operator about
issues affecting their running bot.

Gramless Updates is a shared GitHub App with Actions write and Metadata read.
Telegram connects through device flow, requesting the selected repository ID.
Each bot stores its own short-lived owner/repository user token and device state
in private configuration, readable to database/CLI administrators. No app private
key, client secret, refresh token or personal access token is retained. The TGCloud
deployment token stays in Actions secrets. Disable with `npm run setup:updates -- off`
and revoke user authorization in GitHub when retiring the integration. Only the
Telegram owner can use bot controls; repository writers may run the browser workflow.
Deployments refuse pending schema changes and module removal. Repository maintainers
and published upstream code remain trusted. Installing the shared app does not by
itself grant one bot access to another bot's credentials.

This project has no guaranteed response time or independent security audit claim.
