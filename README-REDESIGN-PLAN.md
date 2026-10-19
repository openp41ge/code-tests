# README Redesign Plan — openp41ge/code-tests

Status: agreed work, not yet done
This is a working plan for contributors/agents. It is **not** the README.

## Goal

Rewrite this repo's `README.md` so it reads as a **project-overview** document
rather than developer onboarding on how the test harness runs. It should:

1. say **what this repo is** (the private test suite for the openp41ge code editor);
2. place it **within the openp41ge project** and name its **relationship to the sibling repos**;
3. **point elsewhere** for any developer onboarding — it must not contain run/test/layout details.

## README rules

- Lead with the project and this repo's role in it.
- Include a **Relationship to other repos** section.
- **No developer onboarding**: no run commands, no layout descriptions, no CI mechanism details, no local setup.
  At most, link to a doc or to the repo it tests.
- Keep it short and durable; avoid details that go stale.

## Shared README skeleton (used across all openp41ge repos)

1. **Project intro** — what openp41ge is (one or two paragraphs).
2. **This repo** — what it is and does, in project terms.
3. **Relationship to other repos** — the project map and how siblings interact.
4. **Repo-specific notes** — still project-level, not onboarding.
5. **Developing / docs** — a single line pointing to the doc(s) with the test/build/setup details.

## Relationship to other repos (shared content)

- `openp41ge/code` — the openp41ge **code editor** desktop app (Electron). This repo tests it. (Do **not**
  refer to it as `openp41ge/app`.)
- `openp41ge/browser` — the openp41ge companion web browser (CEF), the sibling app.
- `openp41ge/web` — the openp41ge backend services (authentication, portal/relay, content, mongo).
- Pairing convention: each public app repo has a private tests repo (`browser` ↔ `browser-tests`,
  `code` ↔ `code-tests`), connected by GitHub Actions dispatch and commit statuses.

## Naming corrections

- **Standardise** on `openp41ge/code` for the Electron app; remove any `openp41ge/app` references.
- The Electron app is a **code editor**; if any text calls it a "desktop pane manager", correct it.

## This repo's specific plan (code-tests)

- Keep it as the **private** test suite for `openp41ge/code`; the app repo deliberately contains no tests.
- Replace the "Layout / Running locally / How it runs in CI" onboarding with a short pointer to the app's
  design doc (`AGENTS.md` §5.6) and note the dispatch/status relationship to the app repo.
- Add the **Relationship to other repos** section and the project intro.

## Steps / checklist

- [ ] Rewrite `README.md` to the shared skeleton.
- [ ] Remove layout, run, and CI-mechanism details; keep only pointers.
- [ ] Add the **Relationship to other repos** section using shared content above.
- [ ] Correct naming to `openp41ge/code`; drop `openp41ge/app`.
- [ ] Move developer onboarding to a linked doc, not inlined.

## What NOT to do

- Do not embed test commands, pnpm/vitest commands, paths, or workflow details in the README.
- Do not rename repos or change directories — only the README content and references.
