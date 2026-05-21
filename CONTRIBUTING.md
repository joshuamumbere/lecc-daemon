# Contributing

Thank you for helping improve Local Environment Command Center.

## Development Setup

Requirements:

- Node.js 20 or newer
- npm
- `zip` for extension release archives

Install dependencies:

```sh
npm ci
```

Run the daemon locally:

```sh
npm run dev
```

Load the extension from the `extension/` directory through `chrome://extensions` with Developer Mode enabled.

## Quality Checks

Before opening a pull request, run:

```sh
npm run check
npm run build:extension
```

`npm run check` runs ESLint, JavaScript syntax checks, and the Node test suite.

## Branch And Commit Rules

The `main` branch is protected. Do not push feature or fix commits directly to `main`; create a branch and open a pull request instead:

```sh
git switch -c your-branch-name
git add .
git commit -S -m "Describe your change"
git push -u origin your-branch-name
```

Commits must have verified signatures. To enable SSH commit signing:

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

Then add the matching public key to GitHub as an SSH signing key:

```text
GitHub > Settings > SSH and GPG keys > New SSH signing key
```

If you use GPG instead, configure your GPG signing key:

```sh
git config --global user.signingkey YOUR_GPG_KEY_ID
git config --global commit.gpgsign true
```

## Pull Requests

- Keep changes focused and explain the user-facing behavior.
- Add or update tests when daemon routing, validation, protocol behavior, or security boundaries change.
- Do not expand host command execution unless it is allow-listed, validated, and covered by tests.
- Keep the extension manifest permissions as narrow as possible.
- Update `README.md` when setup, commands, protocol fields, or release behavior changes.

## Release Process

CI checks do not create releases by themselves. Releases are created from version tags:

```sh
npm version patch
git push origin main --follow-tags
```

Tags matching `v*` trigger the release workflow. The workflow runs the full check suite, builds the extension zip, and attaches the zip to the GitHub Release.

The Release workflow can also be run manually from GitHub Actions by entering a tag that exactly matches the package version, such as `v0.1.1`.
