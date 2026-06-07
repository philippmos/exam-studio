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
│   └── question-view/        # a question + its answer options (with feedback)
└── features/                 # routed pages + their dialogs
    ├── dashboard/            # exam list + import dialog
    ├── exam-detail/          # exam overview + start-mode dialog
    └── quiz/                 # the question-by-question runner + summary
```

## User flow

1. **Dashboard** (`/`) – lists all exams. **Import exam** uploads a JSON file
   (e.g. `ceh_questions.json`) and creates a new exam.
2. **Exam detail** (`/exams/:id`) – shows the modules and a **Start exam mode**
   button.
3. **Start dialog** – choose a mode:
   - *All questions, shuffled*
   - *A specific module*
   - *Only not-yet-correct* (questions never answered correctly before)
4. **Quiz runner** (`/sessions/:id`) – answer questions one by one. Clicking an
   option submits it (persisted in the DB) and reveals whether it was correct.
   Navigate back/forth; finish to see a summary.
