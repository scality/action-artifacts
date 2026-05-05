# action-artifacts

This is a **GitHub Action (Node.js/TypeScript)** that provides a standardized interface for interacting with the Scality Artifacts service. It manages the full artifact lifecycle in CI/CD pipelines.

## What this repo is

- A GitHub Action consumed via `uses: scality/action-artifacts@<tag>` in other repos' workflows
- Supports methods: `setup`, `upload`, `promote`, `prolong`, `get`, `index`
- Entry point: `dist/index.js` (bundled by `@vercel/ncc` from TypeScript source in `src/`)

## Tech stack

- **Language**: TypeScript 5.x (strict mode), targeting ES6/CommonJS
- **Runtime**: Node.js 20.x
- **HTTP client**: Axios
- **GitHub API**: `@actions/core`, `@actions/github`, `@octokit/rest`
- **Git operations**: `isomorphic-git`
- **Bundler**: `@vercel/ncc` → single `dist/index.js`
- **Tests**: Jest + ts-jest
- **Linter**: ESLint with GitHub-recommended rules + Prettier

## Key source files

- `src/main.ts` — action entry point (run + post logic)
- `src/artifacts.ts` — core artifact operations (naming, upload, versioning)
- `src/methods.ts` — method implementations
- `src/constants.ts` — input enums and method types
- `src/inputs-artifacts.ts` — input parsing and validation
- `src/utils.ts` — retry logic, git utilities

## Build & test

```bash
yarn build          # tsc → lib/
yarn package        # ncc bundle → dist/index.js
yarn test           # Jest unit tests
yarn lint           # ESLint
yarn format-check   # Prettier check
```

The `dist/index.js` must be committed and kept in sync with `src/` — CI enforces this via `check-dist.yml`.

## No Scality internal git dependencies

This repo does not use arsenal, vaultclient, bucketclient, or werelogs.
