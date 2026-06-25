# Exam Studio – Client

Angular 19 (standalone components, signals) + Angular Material.

## Getting started

```bash
cd client
npm install
npm start
```

The app runs at <http://localhost:4200> and talks to the API at
`http://localhost:8000/graphql` (configured in
`src/environments/environment.ts`). Make sure the API is running first.

## Project structure

```
src/app/
├── core/                     # cross-cutting, non-visual code
│   ├── models.ts             # TypeScript types mirroring the GraphQL schema
│   ├── graphql.service.ts    # tiny GraphQL-over-HttpClient client
│   └── exam.service.ts       # all exam/session queries & mutations
├── shared/                   # reusable, presentational components
│   ├── exam-card/            # one exam tile on the dashboard
│   ├── stat-card/            # a reusable KPI tile
│   └── question-view/        # a question + its options (feedback + explanation)
└── features/                 # routed pages + their dialogs
    ├── dashboard/            # exam list + import dialog
    ├── exam-detail/          # exam overview + start-mode dialog
    ├── exam-progress/        # per-exam learning-progress dashboard
    └── quiz/                 # the question-by-question runner + summary
```

## User flow

1. **Dashboard** (`/`) – lists all exams. **Import exam** uploads a JSON file
   (e.g. `exam.json`) and creates a new exam.
2. **Exam detail** (`/exams/:id`) – shows the modules and a **Start exam mode**
   button.
3. **Start dialog** – choose a mode:
   - _All questions, shuffled_
   - _A specific module_
   - _Only not-yet-correct_ (questions never answered correctly before)
4. **Quiz runner** (`/sessions/:id`) – answer questions one by one. Clicking an
   option submits it (persisted in the DB) and reveals whether it was correct.
   Navigate back/forth; finish to see a summary.
5. **Learning progress** (`/exams/:id/progress`) – a dashboard of KPI tiles
   (coverage, mastery, accuracy, mastered / needs-review / not-started counts,
   sessions, last activity), an overall question-breakdown bar and a per-module
   breakdown. Reachable from the dashboard card (chart icon) or the exam detail
   page (**Learning progress**).

## End-to-end tests

`e2e/` contains the Playwright E2E suite. It tests the **production bundle**
(`npm run build` output) served by a small proxy server, against a real API —
see [e2e/README.md](e2e/README.md) for local usage and pipeline details.

```bash
npm run build && cd e2e && npm ci && npm test
```
