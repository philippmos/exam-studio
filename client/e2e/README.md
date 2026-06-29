# Client E2E tests (Playwright)

Browser end-to-end tests for the Angular client. By default they test the
**production bundle** (`client/dist`): `server.mjs` serves it with SPA
fallback and proxies `/graphql` to the API — the same role nginx has in the
shipped image — and Chromium drives the real UI against a real API.

> ## Authentication required
>
> The app now sits behind Auth0: every route is guarded and `/graphql` requires
> a Bearer access token. The tests therefore need an **authenticated browser
> session**. The recommended approach is a Playwright global setup that logs in
> once and saves the [`storageState`](https://playwright.dev/docs/auth), reused
> by all specs; the seeding/cleanup that talks to the API directly needs a token
> too (see the M2M approach in `api/e2e/README.md`).
>
> This is **not yet wired in the test code** (the OAuth change was scoped
> document-only). Configure the SPA + a test user/M2M app per
> [`docs/auth0-setup.md`](../../docs/auth0-setup.md) before enabling the suite.

## What is covered

| Spec                         | Covers                                                       |
| ---------------------------- | ------------------------------------------------------------ |
| `app-shell.spec.ts`          | navigation, seeded sample exam, SPA fallback route            |
| `import-exam.spec.ts`        | import dialog (file upload, success snackbar, error handling) |
| `exam-flow.spec.ts`          | full exam run incl. multiple choice, wrong-answer feedback, summary, learning progress, by-section mode |
| `session-management.spec.ts` | exit + resume at first unanswered question, sessions list, delete session |
| `exam-management.spec.ts`    | delete exam with confirm dialog                               |

Test design:

* **Self-contained** — each test seeds its own uniquely named exam through
  the GraphQL API (`examFactory` fixture) and cleans it up afterwards;
  the UI flows themselves all happen in the browser.
* Questions are shuffled by the API, so the quiz page object recognises
  correct/wrong answers via the `Correct:` / `Wrong:` text markers of the
  fixtures and multiple-choice questions via the "Check answer" button.
* Locators follow Playwright's recommendation: roles, accessible names and
  visible text — no brittle CSS chains.

## Run locally

```bash
# 1. start the database + API (repo root)
docker compose up -d --build db api

# 2. build the production bundle the tests serve
cd client
npm ci
npm run build

# 3. run the tests
cd e2e
npm ci
npx playwright install chromium    # first time only
npm test
npm run test:ui                    # interactive UI mode
```

Environment knobs:

| Variable   | Default                 | Meaning                                            |
| ---------- | ----------------------- | -------------------------------------------------- |
| `API_URL`  | `http://localhost:8000` | API the proxy/seeding talk to                       |
| `BASE_URL` | *(unset)*               | Test an already running app instead of `server.mjs` (e.g. `http://localhost:4200` for `ng serve`, `http://localhost:8080` for the compose stack) |
| `PORT`     | `4173`                  | Port for `server.mjs`                               |

## In the pipeline

The `client-e2e` job (see `client/.gitlab-client-ci.yml`):

* takes the production bundle from the `build` job's artifact,
* starts `postgres:16` (fresh database) and the **released API image**
  (`api:latest`, overridable via `API_SERVICE_TAG`) as job services,
* runs in the official Playwright image — **pin its version to the
  `@playwright/test` version in `package.json`** (`v1.60.0` ↔
  `mcr.microsoft.com/playwright:v1.60.0-noble`),
* publishes JUnit results to the GitLab test report and keeps the HTML
  report (with traces/screenshots of failures) as an artifact.

Note: the very first pipeline must run the **api** pipeline once (push to the
default branch) so `api:latest` exists in the registry for the client E2E job.
