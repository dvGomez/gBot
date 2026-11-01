# Repository workflow

- Write commit messages in English using Conventional Commits (`feat:`, `fix:`, `chore:`, `ci:`, etc.).
- Create or push release/version tags only when the user explicitly requests a release or tag. Authorization to commit or push the main branch does not authorize a release.
- Regular main/PR builds run checks and produce artifacts. Only explicit `vX.Y.Z` tag pushes publish GitHub releases.
- Run `npm run typecheck`, `npm test`, and `npm run build` for changes affecting runtime behavior.
