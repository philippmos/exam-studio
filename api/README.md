# Exam Studio – API

FastAPI + Strawberry (GraphQL) + SQLAlchemy (async) + Alembic + PostgreSQL.

## Tech stack

| Concern        | Choice                                  |
| -------------- | --------------------------------------- |
| Web framework  | FastAPI                                 |
| API style      | GraphQL via Strawberry                  |
| ORM            | SQLAlchemy 2.0 (async, `asyncpg`)       |
| Migrations     | Alembic (code-first)                    |
| Database       | PostgreSQL                              |

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

### 2. Create a virtual environment & install dependencies

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
```

Adjust `DATABASE_URL` / `CORS_ORIGINS` if needed.

### 4. Run the database migrations

```bash
alembic upgrade head
```

### 5. Start the API

```bash
uvicorn app.main:app --reload
```

* GraphQL endpoint & in-browser playground: <http://localhost:8000/graphql>
* Health check: <http://localhost:8000/health>

## Database migrations (Alembic, code-first)

The models in `app/models.py` are the source of truth. Workflow:

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

## GraphQL API overview

**Queries**

| Field                 | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `exams`               | All exams (dashboard).                               |
| `exam(id)`            | A single exam with its sections and counts.          |
| `session(id)`         | A session with its ordered questions.                |
| `examStats(examId)`   | Aggregated learning-progress statistics for an exam. |
| `reviewDue(examId)`   | Questions due for spaced-repetition review, per exam.|

**Mutations**

| Field                                              | Description                              |
| -------------------------------------------------- | ---------------------------------------- |
| `importExam(payload)`                              | Import an exam from a JSON string.       |
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

## API tests

`e2e/` contains a Playwright test suite that exercises the GraphQL API of a
running instance (no browser) — import validation, session modes, answer
semantics, statistics. See [e2e/README.md](e2e/README.md).

```bash
docker compose up -d --build db api   # repo root
cd api/e2e && npm ci && npm test
```
