import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
  {
    path: 'exams/:id',
    loadComponent: () =>
      import('./features/exam-detail/exam-detail.component').then(
        (m) => m.ExamDetailComponent,
      ),
  },
  {
    path: 'exams/:id/progress',
    loadComponent: () =>
      import('./features/exam-progress/exam-progress.component').then(
        (m) => m.ExamProgressComponent,
      ),
  },
  {
    path: 'sessions/:id',
    loadComponent: () =>
      import('./features/quiz/quiz.component').then((m) => m.QuizComponent),
  },
  { path: '**', redirectTo: '' },
];
