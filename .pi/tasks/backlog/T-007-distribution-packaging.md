# T-007: Distribution / pi-package packaging

Package this extension for distribution (npm or git) as a pi package. Deferred from T-004 — we are focusing on local development/deployment first.

**Key rule (docs/packages.md "Dependencies"):** Pi bundles the core packages for extensions/skills. If you import any of `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `typebox`, list them in `peerDependencies` with a `"*"` range and do NOT bundle them. This project imports three of these (`pi-coding-agent`, `pi-ai`, `typebox`) → all `peerDependencies: "*"`, never `dependencies`/`bundledDependencies`. Production installs use `npm install --omit=dev`, so devDependencies (type-check only) are not shipped.

**Scope:**
- Add `peerDependencies` with `"*"` for the three core imports.
- Optional: `pi` manifest / `pi-package` keyword for discoverability.
- Choose distribution channel (npm vs git); any `pi` resource globs.
- Verify a clean `pi install` / `pi -e` load in a fresh environment.

**Acceptance criteria:**
- `pi install` (or `pi -e`) loads the extension in a clean env.
- Core imports resolve from Pi's bundled copies (not a bundled local copy).
- devDependencies are not shipped.
