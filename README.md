# Openp41ge App: Tests (private)

Tests for [openp41ge/code](https://github.com/openp41ge/code). This repo is
private; the public repo contains no tests, test configs or demos, so it
can't be used to recreate the application from them. See `AGENTS.md` §5.6 in
the app.

## Layout

The layout mirrors the app's, so each test sits where it would in the app:

```
packages/<pkg>/test/...          a package's unit and integration tests
packages/<pkg>/vitest.config.ts  its Vitest project
demos/<demo>/                    per-capability demo harnesses (Vite)
support/app.ts                   runs all of this against an app checkout
vitest.config.ts                 every package as one Vitest project
.pi/skills/test-*                skills for testing the demos and the app by hand
.github/workflows/test.yml
```

## Running locally

Check out both repos side by side:

```
~/Repository/openp41ge/
  code/master/    the app (a worktree of the bare `code` repo; an older
                  `app/master` checkout is found too)
  code-tests/
```

Install and build the app first (`pnpm install && pnpm nx run-many -t build`
in `code/master`), then here:

```sh
pnpm install
pnpm test                                # every package
pnpm test --project openp41ge            # one package
pnpm test -t "test name pattern"         # one test
APP_DIR=/path/to/app pnpm test           # another app checkout or worktree
pnpm --filter openp41ge-file-editor-demo dev   # a demo
```

### How the tests reach the app

`support/app.ts`'s `appMirror` plugin resolves every import made from a file
here as if that file sat at the same path in the app checkout:

- `vitest` / `@vitest/*` come from this repo (the runner's own copy);
- other packages (`lit`, `openp41ge-sdk`, …) come from the app, so a test and
  the code it tests share one copy; then from this repo (test-only
  dependencies such as `jsdom` and `@xterm/xterm`);
- relative imports resolve here first (helpers, stubs, fixtures), then in the
  app (`../../src/...`).

A test that reads app files by path uses `inApp(__dirname)` or `APP_DIR` from
`@code-tests/support`.

## How it runs in CI

1. The app's `prerequisites.yml` sends a `repository_dispatch` (`test-app`)
   to this repo with the commit SHA.
2. `test.yml` checks out `openp41ge/code` at that SHA, installs and builds it,
   runs the tests, and posts an `code-tests` commit status back to that commit.
3. The app's release workflow requires that status to pass.

A push here tests code's current `master`; a maintainer can test any
commit with `workflow_dispatch` (sha).

Both repos use the org's `openp41ge-app-ci` GitHub App, installed on both
(contents write, for the dispatch to code-tests; commit statuses write, for
the status on code). Its client id is the `APP_CI_CLIENT_ID` variable and its
private key the `APP_CI_PRIVATE_KEY` secret. The org is on the Free plan,
where org-level variables and secrets reach only public repos: code uses the
org-level ones (shared with code and code-tests), and this private repo has its
own repo-level copies.
