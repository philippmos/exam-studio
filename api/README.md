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
                        │            └─ is_correct flag
                        └─ question_type (SINGLE_CHOICE / MULTIPLE_CHOICE)

ExamSession ──< SessionItem ──< SessionItemAnswer  (the persisted selection)
                     └─ is_correct + answered_at
```

* An **Exam** (a certification) is divided into **Section**s (modules).
* Each **Section** contains **Question**s, each with several **Answer** rows.
  Correct options are stored as a boolean flag on the answer row rather than
  as duplicated ids on the question (proper normalisation). A question's
  `question_type` decides how many answers are expected: `SINGLE_CHOICE`
  (exactly one correct answer) or `MULTIPLE_CHOICE` (one or more).
* An **ExamSession** is one run. When it starts, an ordered list of
  **SessionItem**s is snapshotted. Answering a question writes the chosen
  answers (one **SessionItemAnswer** row each) and whether the selection was
  correct onto its item. A multiple-choice selection only counts as correct
  when it matches the set of correct answers exactly.

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
and it drops the former one-correct-answer-per-question index.

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

**Mutations**

| Field                                              | Description                              |
| -------------------------------------------------- | ---------------------------------------- |
| `importExam(payload)`                              | Import an exam from a JSON string.       |
| `deleteExam(id)`                                   | Delete an exam (cascades).               |
| `startSession(examId, mode, sectionId)`            | Start a run; snapshots the questions.    |
| `submitAnswer(sessionItemId, selectedAnswerIds)`   | Persist the answer(s), returns correctness. |
| `finishSession(id)`                                | Mark a session finished.                 |

`mode` is one of `ALL_RANDOM`, `BY_SECTION` (requires `sectionId`) or
`UNANSWERED` (only questions never answered correctly before).
