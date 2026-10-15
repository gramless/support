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

If a token has leaked, revoke it in BotFather immediately. Removing it from a
message or commit does not revoke access. Notify the deployment operator about
issues affecting their running bot.

This project has no guaranteed response time or independent security audit claim.
