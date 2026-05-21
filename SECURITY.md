# Security Policy

LECC controls local developer services and files through a localhost daemon, so security reports are taken seriously.

## Supported Versions

Only the latest released version is supported with security fixes.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting if it is enabled for this repository, or contact the maintainers through the repository owner profile.

Include:

- A clear description of the issue.
- Steps to reproduce it.
- The affected platform and browser.
- Any relevant logs, screenshots, or proof-of-concept details.

## Security Expectations

- The daemon must stay bound to `127.0.0.1` by default.
- Host actions must remain allow-listed and must not execute arbitrary shell input.
- Log and permission paths must be validated against configured allowed directories.
- Browser extension permissions should stay narrow and justified.
