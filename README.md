# Exam Studio

A small full-stack app for practising certification exams. Import an exam
(certification) as JSON, then run a question-by-question exam mode and have your
answers tracked in the database.

* **API** – FastAPI + GraphQL (Strawberry) + SQLAlchemy (async) + Alembic + PostgreSQL
* **Client** – Angular 19 (standalone, signals) + Angular Material

```
exam-studio/
├── api/                 # Python GraphQL backend  (see api/README.md)
├── client/              # Angular frontend        (see client/README.md)
├── docker-compose.yml   # PostgreSQL for local dev
└── ceh_questions.json   # sample exam to import
```

## Domain model

```
Exam ──< Section ──< Question ──< Answer (one flagged is_correct)
ExamSession ──< SessionItem (stores the chosen answer + correctness)
```

* An **Exam** is a certification (e.g. *Certified Ethical Hacker*).
* It is split into **Section**s (modules), each holding **Question**s.
* Each question has four **Answer**s; the correct one is a boolean flag.
* Starting an exam snapshots an ordered **ExamSession** of **SessionItem**s.
  Every answer you give is persisted on its item.

## Run the whole stack with Docker

Build and start PostgreSQL, the API and the client together:

```bash
docker compose up --build
```

Then open the app at <http://localhost:8080>. nginx serves the Angular build and
reverse-proxies `/graphql` to the API (same origin, so no CORS). The API is also
reachable directly at <http://localhost:8000/graphql>. Database migrations
(`alembic upgrade head`) run automatically when the API container starts.

Stop everything with `docker compose down` (add `-v` to also drop the database
volume).

| Service | Image                        | Host port |
| ------- | ---------------------------- | --------- |
| client  | Angular build served by nginx | 8080      |
| api     | FastAPI / uvicorn             | 8000      |
| db      | PostgreSQL 16                 | 5432      |

## Quick start (local dev, without containers for the apps)

### 1. Database

```bash
docker compose up -d db
```

### 2. API

```bash
cd api
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

API at <http://localhost:8000/graphql>.

### 3. Client

```bash
cd client
npm install
npm start
```

App at <http://localhost:4200>.

### 4. Try it

Open the app, click **Import exam**, choose `ceh_questions.json`, then open the
exam and **Start exam mode**.

See `api/README.md` for database-migration details and `client/README.md` for
the frontend structure.

### Import data

Create a json file with your desired exam content

```json
{
  "exam": {
    "name": "Dummy Exam",
    "issuer": "Dummy Issuer",
    "sections": [
      {
        "key": "dummy_section",
        "name": "Dummy Section"
      }
    ],
    "questions": [
      {
        "question": "Dummy question text?",
        "answers": [
          { "text": "Dummy answer A" },
          { "text": "Dummy answer B", "is_correct": true },
          { "text": "Dummy answer C" },
          { "text": "Dummy answer D" }
        ],
        "section_key": "dummy_section",
        "question_type": "single_choice"
      }
    ]
  }
}
```
