import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { Exam, SessionSetup } from '../../core/models';
import { SessionSetupDialogComponent } from './session-setup-dialog.component';

@Component({
  selector: 'app-exam-detail',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <button mat-button (click)="goBack()" class="back">
        <mat-icon>arrow_back</mat-icon> Dashboard
      </button>

      @if (exam(); as exam) {
        <header class="header">
          <div>
            <h1>{{ exam.name }}</h1>
            @if (exam.issuer) {
              <p class="subtitle">{{ exam.issuer }}</p>
            }
            <p class="meta">
              {{ exam.sections.length }} modules · {{ exam.questionCount }}
              questions
            </p>
          </div>
          <div class="header-actions">
            <button mat-stroked-button [routerLink]="['/exams', exam.id, 'progress']">
              <mat-icon>insights</mat-icon> Learning progress
            </button>
            <button mat-flat-button color="primary" (click)="openSetup(exam)">
              <mat-icon>play_arrow</mat-icon> Start exam mode
            </button>
          </div>
        </header>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>Modules</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-list>
              @for (section of exam.sections; track section.id) {
                <mat-list-item>
                  <mat-icon matListItemIcon>folder</mat-icon>
                  <span matListItemTitle>{{ section.name }}</span>
                  <span matListItemMeta>{{ section.questionCount }}</span>
                </mat-list-item>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>
      } @else if (loading()) {
        <div class="center"><mat-spinner diameter="48" /></div>
      } @else {
        <p>Exam not found.</p>
      }
    </div>
  `,
  styles: [
    `
      .back {
        margin-bottom: 8px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
      }
      .subtitle {
        margin: 4px 0 0;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.7);
      }
      .meta {
        margin: 8px 0 0;
        color: rgba(0, 0, 0, 0.6);
      }
      .header-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .center {
        display: flex;
        justify-content: center;
        padding: 64px 0;
      }
    `,
  ],
})
export class ExamDetailComponent implements OnInit {
  private readonly examService = inject(ExamService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound from the `:id` route param via withComponentInputBinding(). */
  readonly id = input.required<string>();

  readonly exam = signal<Exam | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.examService.getExam(this.id()).subscribe({
      next: (exam) => {
        this.exam.set(exam);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
  }

  openSetup(exam: Exam): void {
    this.dialog
      .open(SessionSetupDialogComponent, { data: { exam }, width: '460px' })
      .afterClosed()
      .subscribe((setup: SessionSetup | undefined) => {
        if (setup) {
          this.startSession(exam, setup);
        }
      });
  }

  private startSession(exam: Exam, setup: SessionSetup): void {
    this.examService
      .startSession(exam.id, setup.mode, setup.sectionId)
      .subscribe({
        next: (session) => {
          if (session.total === 0) {
            this.snackBar.open(
              'No questions match this selection.',
              'OK',
              { duration: 4000 },
            );
            return;
          }
          this.router.navigate(['/sessions', session.id]);
        },
        error: (err: Error) =>
          this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
      });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
