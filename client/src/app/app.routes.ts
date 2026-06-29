import { Routes } from '@angular/router';

import { authGuard } from './core/auth-guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'exams/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exam-detail/exam-detail').then((m) => m.ExamDetail),
  },
  {
    path: 'exams/:id/progress',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exam-progress/exam-progress').then(
        (m) => m.ExamProgress,
      ),
  },
  {
    path: 'statistics',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/statistics/statistics').then((m) => m.Statistics),
  },
  {
    path: 'sessions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sessions/sessions').then((m) => m.Sessions),
  },
  {
    path: 'sessions/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/quiz/quiz').then((m) => m.Quiz),
  },
  {
    path: 'archive',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/archive/archive').then((m) => m.Archive),
  },
  { path: '**', redirectTo: '' },
];
