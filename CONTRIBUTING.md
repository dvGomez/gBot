# Contributing to gBot

Thanks for wanting to help! gBot follows the same model as VS Code: the code is open source (MIT license), anyone
can fork it and change it freely, and good improvements come back to the main project through pull requests.

## Ways to help

- **Report a bug** or **suggest a feature** using the [issue templates](https://github.com/dvGomez/gBot/issues/new/choose).
- **Share ideas, workflows and bots** you built in [Discussions](https://github.com/dvGomez/gBot/discussions).
- **Send code:** issues labeled `good first issue` are a nice place to start. For bigger changes, open an issue or a
  discussion first so we can agree on the approach before you put in the work.

## Development setup

You need Node.js 24+, npm and [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in
with a Claude subscription.

```bash
git clone https://github.com/<you>/gBot.git
cd gBot
npm install
npm run dev
```

The [README](README.md#for-developers) explains how the app is organized and how each part works.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep the change focused: one feature or fix per PR.
3. Follow the style of the code around you (TypeScript, React function components, Tailwind classes, no
   semicolons, single quotes).
4. Run `npm run typecheck` before opening the PR. CI runs it too and builds the macOS and Windows installers.
5. Describe what changed and why. Screenshots or a short video help a lot for UI changes.
6. Sign off your commits with `git commit -s` (see below).

## Contribution license

By sending a pull request, you agree that your contribution is licensed under the same license as the project
(MIT, see [LICENSE](LICENSE)) and that it can be merged, modified and distributed as part of gBot.

To record this, each commit carries a `Signed-off-by` line (`git commit -s` adds it for you). It's your statement
under the [Developer Certificate of Origin](https://developercertificate.org/): the code is yours, or you have the
right to submit it under this license.

## Name and brand

The code is free, but the **gBot** name and the **Brasa** mascot identify the official project. Published forks are
very welcome, just use a different name and icon so nobody confuses them with the official app.

## Code of conduct

Everyone taking part is expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
