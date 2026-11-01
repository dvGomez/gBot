# Releases and updates

Releases are created only after a maintainer explicitly pushes a version tag. Pushing `main`, opening a PR, or running the Build workflow never publishes a release.

After the user explicitly requests a release, choose the requested version, tag the desired commit, and push that tag. For example, `v0.3.0` publishes version `0.3.0`; `v0.3.0-beta.1` publishes a prerelease. Never create a tag as part of an ordinary commit/push request.

The Release workflow validates the tag, runs checks, builds Windows and macOS installers, and publishes a GitHub release with generated notes. The version is taken from the tag and applied to the package files in the CI checkout only. CI never creates commits or tags.

Published assets include Windows NSIS installers and blockmaps, macOS DMG and ZIP installers for Intel and Apple Silicon, and the update manifests consumed by `electron-updater`. Stable installed builds check the public GitHub release feed at startup and every four hours. Prereleases are not offered to stable builds.

Updates are optional. The application notifies users of a new version and downloads it in the background unless disabled in Settings. Users can skip a version, which hides its reminder and prevents further automatic downloads for that version; they can still download it from Settings. Installation requires an explicit restart and is blocked while chats, bot tasks, or workflows are active. Closing the app never installs an update automatically. Development builds do not download or install updates.

macOS automatic updates require a Developer ID-signed application. Configure these repository Actions secrets to enable signed/notarized release builds:

- `MAC_CSC_LINK`: signing certificate in base64 or a supported certificate URL.
- `MAC_CSC_KEY_PASSWORD`: certificate password.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: notarization credentials.

Without a Developer ID signature, the app still checks for releases and offers the release page for manual installation. Windows installer signing can be added separately through electron-builder's Windows signing configuration.

Older installations built before the updater was added need to be upgraded manually once. Later compatible builds can update through the app.
