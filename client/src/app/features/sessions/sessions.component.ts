import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ExamService } from '../../core/exam.service';
import { SessionOverview } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Sessions</h1>
          <p class="subtitle">
            Resume open sessions or review finished ones.
          </p>
        </div>
      </header>

      @if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else if (sessions().length === 0) {
        <div class="empty-state">
          <div class="empty-icon"><mat-icon>history</mat-icon></div>
          <p>No sessions yet. Open an exam and start practising.</p>
          <button mat-stroked-button (click)="goDashboard()">
            <mat-icon>school</mat-icon> Browse exams
          </button>
        </div>
      } @else {
        @if (openSessions().length > 0) {
          <h2 class="group-title">In progress</h2>
          <div class="list">
            @for (s of openSessions(); track s.id) {
              <mat-card appearance="outlined" class="session-card">
                <mat-card-content class="row">
                  <div class="info">
                    <span class="exam-name">{{ s.examName }}</span>
                    <span class="meta">
                      {{ modeLabel(s) }} ·
                      started {{ s.createdAt | date: 'medium' }}
                    </span>
                  </div>
                  <div class="progress-block">
                    <mat-progress-bar
                      mode="determinate"
                      [value]="percent(s)"
                    />
                    <span class="progress-label">
                      {{ s.answered }} / {{ s.total }} answered
                    </span>
                  </div>
                  <div class="actions">
                    <button mat-flat-button (click)="openSession(s)">
                      <mat-icon>play_arrow</mat-icon> Continue
                    </button>
                    <button
                      mat-icon-button
                      aria-label="Delete session"
                      matTooltip="Delete session"
                      class="delete"
                      (click)="deleteSession(s)"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>
        }

        @if (finishedSessions().length > 0) {
          <h2 class="group-title">Completed</h2>
          <div class="list">
            @for (s of finishedSessions(); track s.id) {
              <mat-card appearance="outlined" class="session-card">
                <mat-card-content class="row">
                  <div class="info">
                    <span class="exam-name">{{ s.examName }}</span>
                    <span class="meta">
                      {{ modeLabel(s) }} ·
                      finished {{ s.finishedAt | date: 'medium' }}
                    </span>
                  </div>
                  <div class="progress-block">
                    <span class="result">
                      <mat-icon class="result-icon">check_circle</mat-icon>
                      {{ s.correct }} / {{ s.total }} correct
                    </span>
                  </div>
                  <div class="actions">
                    <button mat-stroked-button (click)="openSession(s)">
                      <mat-icon>visibility</mat-icon> Review
                    </button>
                    <button
                      mat-icon-button
                      aria-label="Delete session"
                      matTooltip="Delete session"
                      class="delete"
                      (click)="deleteSession(s)"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .group-title {
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin: 28px 0 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 24px;
      }
      .info {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .exam-name {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .progress-block {
        flex: 0 0 220px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .progress-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        font-variant-numeric: tabular-nums;
      }
      .result {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
        color: var(--app-success);
        font-variant-numeric: tabular-nums;
      }
      .result-icon {
        font-size: 20px;
        height: 20px;
        width: 20px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .delete:hover mat-icon {
        color: var(--app-danger);
      }
      @media (max-width: 700px) {
        .row {
          flex-wrap: wrap;
          gap: 12px;
        }
        .info {
          flex-basis: 100%;
        }
        .progress-block {
          flex: 1 1 auto;
        }
      }
    `,
  ],
})
export class SessionsComponent {
  private readonly examService = inject(ExamService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly sessions = signal<SessionOverview[]>([]);
  readonly loading = signal(true);

  readonly openSessions = computed(() =>
    this.sessions().filter((s) => s.finishedAt === null),
  );
  readonly finishedSessions = computed(() =>
    this.sessions().filter((s) => s.finishedAt !== null),
  );

  constructor() {
    this.examService.getSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
  }

  modeLabel(session: SessionOverview): string {
    switch (session.mode) {
      case 'BY_SECTION':
        return session.sectionName ?? 'Single module';
      case 'UNANSWERED':
        return 'Not-yet-correct questions';
      default:
        return 'All questions';
    }
  }

  percent(session: SessionOverview): number {
    return session.total ? (session.answered / session.total) * 100 : 0;
  }

  openSession(session: SessionOverview): void {
    this.router.navigate(['/sessions', session.id]);
  }

  deleteSession(session: SessionOverview): void {
    ConfirmDialogComponent.open(this.dialog, {
      title: 'Delete session',
      message: `Delete this "${session.examName}" session and its answers? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.examService.deleteSession(session.id).subscribe({
        next: () => {
          this.sessions.update((list) =>
            list.filter((s) => s.id !== session.id),
          );
          this.snackBar.open('Session deleted.', 'OK', { duration: 3000 });
        },
        error: (err: Error) =>
          this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
      });
    });
  }

  goDashboard(): void {
    this.router.navigate(['/']);
  }
}
