# Exam Studio – API

FastAPI + Strawberry (GraphQL) + SQLAlchemy (async) + Alembic + PostgreSQL.

## Tech stack

| Concern        | Choice                                          |
| -------------- | ----------------------------------------------- |
| Web framework  | FastAPI                                         |
| API style      | GraphQL via Strawberry                          |
| ORM            | SQLAlchemy 2.0 (async, `asyncpg`)               |
| Migrations     | Alembic (code-first)                            |
| Database       | PostgreSQL                                      |
| Packaging      | uv (`pyproject.toml` + `uv.lock`)               |
| Code quality   | Ruff (lint + format), mypy (strict), pre-commit |
| Observability  | structlog (JSON), Prometheus, OpenTelemetry     |

## Architecture

The code is organised in layers with a strict dependency direction —
`graphql → services → repositories → models/db`, and everything may use
`domain` and `core`; `domain` depends on nothing (no SQLAlchemy, no Strawberry):

| Layer               | Package              | Responsibility                                            |
| ------------------- | -------------------- | --------------------------------------------------------- |
| Presentation        | `app/graphql`        | Thin Strawberry resolvers + types/converters; no logic.   |
| Application         | `app/services`       | Use cases, transaction boundaries, orchestration.         |
| Data access         | `app/repositories`   | All SQLAlchemy queries; returns ORM objects / rows.       |
| Domain              | `app/domain`         | Framework-free rules: grading, Leitner, planning, streak. |
| Persistence / infra | `app/db`, `app/core` | Engine/session, config, logging, security, observability. |

Business logic lives in `services`/`domain`, never in the resolvers, so it is
testable in isolation and the GraphQL layer stays a thin adapter.

## Data model

```
Exam ──< Section ──< Question ──< Answer
                        │            ├─ is_correct flag        (choice)
                        │            └─ correct_category_id     (allocation item)
                        ├─ question_type (SINGLE_CHOICE / MULTIPLE_CHOICE / ALLOCATION)
                        ├─ explanation (optional; revealed after answering)
                        └─< QuestionCategory  (allocation baskets: key + label)

ExamSession ──< SessionItem ──< SessionItemAnswer  (the persisted selection)
                     │              └─ category_id  (basket, allocation only)
                     └─ is_correct + answered_at
```

* An **Exam** (a certification) is divided into **Section**s (modules).
* Each **Section** contains **Question**s, each with several **Answer** rows.
  A question's `question_type` decides what is expected: `SINGLE_CHOICE`
  (exactly one correct answer), `MULTIPLE_CHOICE` (one or more) or `ALLOCATION`.
  For choice questions, correct options are stored as a boolean flag on the
  answer row (proper normalisation). For an **ALLOCATION** question the answers
  are the items to sort and each points at the **QuestionCategory** (basket) it
  belongs to via `correct_category_id`; the baskets themselves are
  `QuestionCategory` rows (`key` + `label`).
* An **ExamSession** is one run. When it starts, an ordered list of
  **SessionItem**s is snapshotted. Answering a question writes the chosen
  answers (one **SessionItemAnswer** row each) and whether the selection was
  correct onto its item. A multiple-choice selection only counts as correct
  when it matches the set of correct answers exactly; an allocation answer
  records the chosen basket per item (`SessionItemAnswer.category_id`) and is
  correct only when every item sits in its correct category.

### Learning-progress statistics

The `examStats` query derives all progress metrics **on the fly** from the
`SessionItem` history (no aggregates are stored, keeping the schema normalised):

* **coverage** – distinct questions attempted / total
* **mastery** – distinct questions answered correctly at least once / total
* **accuracy** – correct attempts / total attempts (a question re-attempted in a
  later session counts as another attempt)
* counts of mastered / struggling (attempted but never correct) / not-started
  questions, plus a per-module breakdown, session count and last activity.

Migration `0002` adds the integrity constraints these numbers rely on: unique
constraints so a question appears **at most once per session**. Migration
`0003` adds multiple-choice support: the `questions.question_type` column, the
`session_item_answers` table (replacing `session_items.selected_answer_id`)
and it drops the former one-correct-answer-per-question index. Migration `0007`
adds allocation support: the `question_categories` table plus the
`answers.correct_category_id` and `session_item_answers.category_id` columns.
Migration `0008` adds the optional `questions.explanation` column.

## Getting started

### 1. Start PostgreSQL

From the repository root:

```bash
docker compose up -d db
```

This exposes Postgres on `localhost:5432` (db `examstudio`, user/password `exam`/`exam`).

### 2. Install dependencies with uv

[uv](https://docs.astral.sh/uv/) manages the virtualenv and dependencies from
`pyproject.toml` / `uv.lock` (re-run `uv sync` whenever they change):

```bash
cd api
uv sync
```

### 3. Configure environment

```bash
cp .env.example .env
```

Adjust `DATABASE_URL` / `CORS_ORIGINS` if needed, and set `AUTH0_DOMAIN` /
`AUTH0_AUDIENCE` so the API can validate access tokens (see
[Authentication](#authentication-auth0) and `docs/auth0-setup.md`). The
API rejects every GraphQL request with **HTTP 401** until these are configured
and a valid token is supplied.

### 4. Run the database migrations

```bash
uv run alembic upgrade head
```

### 5. Start the API

```bash
uv run uvicorn app.main:app --reload
```

* GraphQL endpoint: <http://localhost:8000/graphql> (requires a valid access
  token; the in-browser IDE is only served when `DEBUG=true`)
* Liveness <http://localhost:8000/health/live> · Readiness (pings the DB)
  <http://localhost:8000/health/ready> · `/health` is a liveness alias — all public
* Metrics: <http://localhost:8000/metrics> (Prometheus; off with `METRICS_ENABLED=false`)

## Authentication (Auth0)

The API is an OAuth2 **resource server**. Every `/graphql` request must present a
valid Auth0 Bearer access token for the configured audience; `/health` stays
public.

* **Token validation** — the access token is RS256-verified against the tenant
  JWKS (`app/auth.py`), checking issuer, audience and expiry. Only `RS256` is
  accepted (`alg: none` and key-confusion attacks are rejected).
* **Users & ownership** — on first login a `User` row is provisioned from the
  token's `sub` (`get_or_create_user`). Every `Exam` (and everything cascading
  from it) has a `user_id`, and all queries/mutations are scoped to the caller,
  so users only ever see their own data.

Required env vars (`.env`):

| Var              | Example                    | Notes                               |
| ---------------- | -------------------------- | ----------------------------------- |
| `AUTH0_DOMAIN`   | `your-tenant.eu.auth0.com` | Tenant domain (no scheme/slash).    |
| `AUTH0_AUDIENCE` | `https://api.exam-studio`  | The API identifier set in Auth0.    |
| `DEBUG`          | `false`                    | `true` also serves the GraphQL IDE. |

See [`docs/auth0-setup.md`](../docs/auth0-setup.md) for the full Auth0 tenant
setup (API, SPA application, optional M2M client for tests).

## Database migrations (Alembic, code-first)

The models in `app/models/` are the source of truth. Workflow:

**Apply all pending migrations** (also the first-time setup):

```bash
alembic upgrade head
```

**Create a new migration after changing the models** — autogenerate diffs the
models against the current database, so the database must be reachable and
up to date first:

```bash
alembic revision --autogenerate -m "describe your change"
# review the generated file in alembic/versions/, then:
alembic upgrade head
```

**Roll back the most recent migration:**

```bash
alembic downgrade -1
```

**Inspect state:**

```bash
alembic current      # current revision in the DB
alembic history      # all revisions
```

> The database URL is read from `DATABASE_URL` (via `app/config.py`) inside
> `alembic/env.py`, so you never hard-code it in `alembic.ini`.

## Importing an exam

Exams are imported through the GraphQL `importExam` mutation. The Angular client
does this for you (Dashboard → **Import exam**), but you can also do it manually:

```graphql
mutation Import($payload: String!) {
  importExam(payload: $payload) {
    id
    name
    questionCount
  }
}
```

…passing the exam document as the `payload` variable (a JSON string; see
`exam.schema.json` in the repository root for the expected shape).
The JSON carries no ids — sections are referenced by their `key` and question
numbers follow the order in the file. Every import generates fresh UUIDs, so
you can import the same file multiple times.

To grow an exam that already exists, the `addExamQuestions(examId, payload)`
mutation merges a document (same format) into it (client: exam detail →
**Add questions**). Only questions whose text is not already present are added;
duplicates are skipped and nothing is ever removed. Sections are matched by
`name` (a referenced module that does not exist yet is created). The result
reports how many questions were `added` versus `skipped`.

## GraphQL API overview

**Queries**

| Field                 | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `userSettings`        | The signed-in user's account settings (theme, ...).  |
| `exams`               | All exams (dashboard).                               |
| `exam(id)`            | A single exam with its sections and counts.          |
| `session(id)`         | A session with its ordered questions.                |
| `examStats(examId)`   | Aggregated learning-progress statistics for an exam. |
| `reviewDue(examId)`   | Questions due for spaced-repetition review, per exam.|

**Mutations**

| Field                                              | Description                              |
| -------------------------------------------------- | ---------------------------------------- |
| `setThemePreference(themePreference)`              | Persist the user's colour scheme (`SYSTEM` / `LIGHT` / `DARK`). |
| `importExam(payload)`                              | Import an exam from a JSON string.       |
| `addExamQuestions(examId, payload)`                | Add new questions from a JSON document to an existing exam; returns `{exam, added, skipped}`. |
| `deleteExam(id)`                                   | Delete an exam (cascades).               |
| `startSession(examId, mode, sectionId)`            | Start a run; snapshots the questions.    |
| `submitAnswer(sessionItemId, selectedAnswerIds, allocations, tzOffsetMinutes)` | Persist the answer; returns correctness and the question's updated review schedule. Choice questions pass `selectedAnswerIds`, allocation questions pass `allocations` (`{answerId, categoryId}` per item). |
| `finishSession(id)`                                | Mark a session finished.                 |

`mode` is one of `ALL_RANDOM`, `BY_SECTION` (requires `sectionId`),
`UNANSWERED` (only questions answered incorrectly at least once before) or `DUE_REVIEW`
(only questions whose spaced-repetition review is due).

Every `submitAnswer` advances the question's Leitner review box: a correct
answer promotes it (longer interval), a wrong answer resets it to box 1.
`tzOffsetMinutes` aligns the next due date to the caller's local day; the
mutation returns `reviewBox` and `reviewIntervalDays` for immediate feedback.

## Code quality

Ruff (lint + format) and mypy (strict, with the Strawberry plugin) are
configured in `pyproject.toml` and enforced in CI. Install the git hooks with
`pre-commit install` to run them on every commit, or run them by hand:

```bash
uv run ruff check app && uv run ruff format --check app
uv run mypy
```

## API tests

`e2e/` contains a Playwright test suite that exercises the GraphQL API of a
running instance (no browser) — import validation, session modes, answer
semantics, statistics. See [e2e/README.md](e2e/README.md).

```bash
docker compose up -d --build db api   # repo root
cd api/e2e && npm ci && npm test
```

> Since authentication is required, the suite needs an access token for the API
> audience (e.g. from an Auth0 machine-to-machine application). See
> [e2e/README.md](e2e/README.md).
