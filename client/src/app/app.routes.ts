import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'exams/:id',
    loadComponent: () =>
      import('./features/exam-detail/exam-detail').then((m) => m.ExamDetail),
  },
  {
    path: 'exams/:id/progress',
    loadComponent: () =>
      import('./features/exam-progress/exam-progress').then(
        (m) => m.ExamProgress,
      ),
  },
  {
    path: 'statistics',
    loadComponent: () =>
      import('./features/statistics/statistics').then((m) => m.Statistics),
  },
  {
    path: 'sessions',
    loadComponent: () =>
      import('./features/sessions/sessions').then((m) => m.Sessions),
  },
  {
    path: 'sessions/:id',
    loadComponent: () => import('./features/quiz/quiz').then((m) => m.Quiz),
  },
  {
    path: 'archive',
    loadComponent: () =>
      import('./features/archive/archive').then((m) => m.Archive),
  },
  { path: '**', redirectTo: '' },
];
