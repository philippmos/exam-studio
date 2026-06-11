import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { ExamStats } from '../../core/models';
import { StatCardComponent } from '../../shared/stat-card/stat-card.component';

@Component({
  selector: 'app-exam-progress',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    StatCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <button mat-button [routerLink]="['/exams', id()]" class="back">
        <mat-icon>arrow_back</mat-icon> Back to exam
      </button>

      @if (stats(); as s) {
        <header class="page-header">
          <div>
            <h1>{{ s.examName }}</h1>
            <p class="subtitle">Learning progress</p>
          </div>
          <button mat-flat-button [routerLink]="['/exams', id()]">
            <mat-icon>play_arrow</mat-icon> Start exam mode
          </button>
        </header>

        @if (s.totalAttempts === 0) {
          <mat-card class="cta" appearance="outlined">
            <mat-icon>insights</mat-icon>
            <div>
              <strong>No attempts yet.</strong>
              Start an exam session to begin tracking your progress.
            </div>
          </mat-card>
        }

        <!-- KPI tiles -->
        <section class="kpis">
          <app-stat-card
            icon="explore"
            color="#00897b"
            tint="#e0f2f1"
            [value]="pct(s.coverage) + '%'"
            label="Coverage"
            [sublabel]="s.attemptedQuestions + ' / ' + s.totalQuestions + ' questions seen'"
          />
          <app-stat-card
            icon="verified"
            color="#2e7d32"
            tint="#e8f5e9"
            [value]="pct(s.mastery) + '%'"
            label="Mastery"
            [sublabel]="s.masteredQuestions + ' / ' + s.totalQuestions + ' answered correctly'"
          />
          <app-stat-card
            icon="ads_click"
            color="#1976d2"
            tint="#e3f2fd"
            [value]="pct(s.accuracy) + '%'"
            label="Accuracy"
            [sublabel]="s.correctAttempts + ' / ' + s.totalAttempts + ' attempts correct'"
          />
          <app-stat-card
            icon="report_problem"
            color="#f9a825"
            tint="#fff8e1"
            [value]="s.strugglingQuestions"
            label="Needs review"
            sublabel="attempted, not yet correct"
          />
          <app-stat-card
            icon="radio_button_unchecked"
            color="#607d8b"
            tint="#eceff1"
            [value]="s.unattemptedQuestions"
            label="Not started"
            sublabel="never attempted"
          />
          <app-stat-card
            icon="history"
            color="#5e35b1"
            tint="#ede7f6"
            [value]="s.sessionsCount"
            label="Sessions"
            [sublabel]="
              s.lastActivity
                ? 'last ' + (s.lastActivity | date: 'mediumDate')
                : 'no activity yet'
            "
          />
        </section>

        <!-- Overall breakdown bar -->
        <mat-card class="panel" appearance="outlined">
          <mat-card-header>
            <mat-card-title>Question breakdown</mat-card-title>
            <mat-card-subtitle>{{ s.totalQuestions }} questions</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="bar">
              <div
                class="seg mastered"
                [style.width.%]="ratio(s.masteredQuestions, s.totalQuestions)"
              ></div>
              <div
                class="seg struggling"
                [style.width.%]="ratio(s.strugglingQuestions, s.totalQuestions)"
              ></div>
              <div
                class="seg untouched"
                [style.width.%]="ratio(s.unattemptedQuestions, s.totalQuestions)"
              ></div>
            </div>
            <div class="legend">
              <span><i class="dot mastered"></i>Mastered ({{ s.masteredQuestions }})</span>
              <span><i class="dot struggling"></i>Needs review ({{ s.strugglingQuestions }})</span>
              <span><i class="dot untouched"></i>Not started ({{ s.unattemptedQuestions }})</span>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Per-module breakdown -->
        <mat-card class="panel" appearance="outlined">
          <mat-card-header>
            <mat-card-title>Progress by module</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="modules">
              @for (sec of s.sections; track sec.sectionId) {
                <div class="module-row">
                  <div class="module-head">
                    <span class="module-name">{{ sec.name }}</span>
                    <span class="module-meta">
                      {{ sec.masteredQuestions }} / {{ sec.totalQuestions }} mastered
                      @if (sec.attemptedQuestions > 0) {
                        · {{ pct(sec.accuracy) }}% accuracy
                      }
                    </span>
                  </div>
                  <div class="bar small">
                    <div
                      class="seg mastered"
                      [style.width.%]="ratio(sec.masteredQuestions, sec.totalQuestions)"
                    ></div>
                    <div
                      class="seg struggling"
                      [style.width.%]="ratio(sec.strugglingQuestions, sec.totalQuestions)"
                    ></div>
                    <div
                      class="seg untouched"
                      [style.width.%]="
                        ratio(
                          sec.totalQuestions -
                            sec.masteredQuestions -
                            sec.strugglingQuestions,
                          sec.totalQuestions
                        )
                      "
                    ></div>
                  </div>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>
      } @else if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else {
        <p>No statistics available.</p>
      }
    </div>
  `,
  styles: [
    `
      .back {
        margin: 0 0 12px -12px;
      }
      .cta {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding: 16px;
        margin-bottom: 20px;
        color: var(--mat-sys-on-surface-variant);
      }
      .cta mat-icon {
        color: var(--mat-sys-primary);
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 20px;
      }
      .panel {
        margin-bottom: 20px;
      }
      .bar {
        display: flex;
        width: 100%;
        height: 18px;
        border-radius: 9px;
        overflow: hidden;
        background: #eceff1;
      }
      .bar.small {
        height: 10px;
        border-radius: 5px;
      }
      .seg {
        height: 100%;
        transition: width 0.3s ease;
      }
      .seg.mastered {
        background: var(--app-success);
      }
      .seg.struggling {
        background: var(--app-warning);
      }
      .seg.untouched {
        background: transparent;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-top: 12px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .dot {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 6px;
        vertical-align: middle;
      }
      .dot.mastered {
        background: var(--app-success);
      }
      .dot.struggling {
        background: var(--app-warning);
      }
      .dot.untouched {
        background: #cfd8dc;
      }
      .modules {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .module-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
      }
      .module-name {
        font-weight: 500;
      }
      .module-meta {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        text-align: right;
      }
    `,
  ],
})
export class ExamProgressComponent implements OnInit {
  private readonly examService = inject(ExamService);
  private readonly snackBar = inject(MatSnackBar);

  readonly id = input.required<string>();

  readonly stats = signal<ExamStats | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.examService.getExamStats(this.id()).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
  }

  /** Percentage 0..1 -> rounded integer. */
  pct(value: number): number {
    return Math.round(value * 100);
  }

  /** Width helper for the segmented bars. */
  ratio(part: number, whole: number): number {
    return whole > 0 ? (part / whole) * 100 : 0;
  }
}
