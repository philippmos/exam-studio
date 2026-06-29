# API tests (Playwright)

Black-box tests for the GraphQL API. They use Playwright's HTTP request
context only — **no browser is involved** — and talk to a *running* API
instance, exactly like the Angular client does.

> ## Authentication required
>
> The API now rejects unauthenticated requests with **HTTP 401**, so this suite
> needs an access token for the API audience. The simplest path (no interactive
> login) is a **machine-to-machine** Auth0 application: fetch a token via the
> `client_credentials` grant and send it as `Authorization: Bearer <token>`.
>
> This token wiring is **not yet implemented in the test code** (the OAuth change
> was scoped document-only). To enable the suite, read a token from an env var
> (e.g. `E2E_ACCESS_TOKEN`) and attach it as a default header in
> `src/graphql-client.ts` and `global-setup.ts`. See
> [`docs/auth0-setup.md`](../../docs/auth0-setup.md) §5 for creating the M2M app
> and fetching the token.

## What is covered

| Spec                        | Covers                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `health.spec.ts`            | `/health`, GraphQL endpoint reachable                         |
| `import-exam.spec.ts`       | `importExam` happy path + every validation error               |
| `exams.spec.ts`             | `exams`, `exam`, `deleteExam`                                  |
| `sessions.spec.ts`          | `startSession` modes (`ALL_RANDOM`, `BY_SECTION`, `UNANSWERED`), no-solution-leaking |
| `submit-answer.spec.ts`     | `submitAnswer` correctness semantics + validation              |
| `session-lifecycle.spec.ts` | `finishSession`, `sessions` overview, `deleteSession`, cascades |
| `exam-stats.spec.ts`        | `examStats` aggregation (coverage, mastery, accuracy, sections) |
| `study-review.spec.ts`      | spaced-repetition Leitner scheduling + `DUE_REVIEW` mode        |

Test design:

* **Self-contained** — every test imports its own uniquely named exam through
  the `examFactory` fixture and everything is deleted afterwards. Tests run
  fully parallel and can be repeated against the same database.
* Since the API (deliberately) never exposes which answer is correct, the
  fixtures encode correctness in the answer **text** (`Correct: …` /
  `Wrong: …`, see `src/exam-payload.ts`).
* The global setup waits for `/health` and then **seeds the database** with
  `fixtures/sample-exam.json` (idempotent — skipped when already present).

## Run locally

```bash
# 1. start the database + API (repo root)
docker compose up -d --build db api

# 2. run the tests
cd api/e2e
npm ci
npm test            # uses API_URL=http://localhost:8000 by default
npm run report      # open the HTML report
```

Point the suite at another instance with `API_URL=http://host:port npm test`.

## In the pipeline

The `api-e2e` job (see `api/.gitlab-api-ci.yml`) runs after the image build:

* `postgres:16` starts as a job service — a **fresh database per pipeline**.
* The **API image built in this pipeline** (`:$CI_COMMIT_SHORT_SHA`) runs as a
  second service; it applies the alembic migrations on boot.
* The tests run against `http://api:8000`; JUnit results show up in the
  GitLab test report, the HTML report is kept as an artifact.
* Only after this job passes is the image re-tagged `:latest` (release stage).
