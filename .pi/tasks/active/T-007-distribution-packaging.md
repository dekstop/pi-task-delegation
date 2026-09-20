# T-007: Distribution / pi-package packaging

Package this extension for distribution (git) as a pi package. Deferred from T-004 — we are focusing on local development/deployment first.

**Key rule (docs/packages.md "Dependencies"):** Pi bundles the core packages for extensions/skills. If you import any of `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `typebox`, list them in `peerDependencies` with a `"*"` range and do NOT bundle them. This project imports **four** of these (`pi-coding-agent`, `pi-ai`, `pi-tui`, `typebox`) → all `peerDependencies: "*"`, never `dependencies`/`bundledDependencies`. Production installs use `npm install --omit=dev`, so devDependencies (type-check only) are not shipped.

> Correction: the earlier "three imports" note missed `@mariozechner/pi-tui` (imported in `index.ts` for `Text`). The full set is four.

**Design & decisions:**
- **Channel:** git — `pi install git:<repo>` (no npm account/publish needed).
- **Source tree:** move source into `src/` (`src/index.ts`, `src/tool.ts`, `src/executor.ts`, `src/scratch.ts`).
- **`pi` manifest:** `{ "extensions": ["./src/index.ts"] }` — points at the entry; the other modules are imported by it, not listed as extensions.
- **`peerDependencies`:** all four core imports with `"*"` (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `typebox`).
- **`devDependencies`:** keep the four core imports (specific versions) for local type-check; not shipped in production.
- **Discoverability:** add `keywords: ["pi-package"]`.
- **`files`:** not needed for git (whole repo is cloned); add later if/when we publish to npm.

**Plan:**
1. Move `index.ts`, `tool.ts`, `executor.ts`, `scratch.ts` into `src/`.
2. Update test imports (`../executor.js` → `../src/executor.js`, etc.).
3. Update `tsconfig.json` `include` to `["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]`.
4. `package.json`: add `pi` manifest, `peerDependencies` (four, `"*"`), `keywords: ["pi-package"]`; keep the four core imports in `devDependencies`.
5. `npx vitest run` — tests pass.
6. Verify a clean `pi install` / `pi -e` load in a fresh environment.

**Open questions:**
- Does `pi install git:<repo>` run `npm install` (which may auto-install the `"*"` peer deps) or `--omit=dev`? Either way Pi's bundled copies are used at runtime, so it's harmless — but confirm on the clean-load check.
- Repo URL / remote for the git install (none configured yet — see "Next").

**Progress:** Steps 1–5 done — `src/` move, test imports updated, `tsconfig.json` updated, `package.json` has `pi` manifest + `peerDependencies` (four, `"*"`) + `pi-package` keyword; 39 tests pass, typecheck clean. Step 6 (clean-load verification) pending — needs a git remote.

**Next:** Set up a git remote, then verify a clean `pi install` / `pi -e` load in a fresh environment.

**Acceptance criteria:**
- `pi install` (or `pi -e`) loads the extension in a clean env.
- Core imports resolve from Pi's bundled copies (not a bundled local copy).
- devDependencies are not shipped.
