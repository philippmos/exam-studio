import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { StatCardComponent } from '../../shared/stat-card/stat-card.component';
import { StreakCardComponent } from '../../shared/streak-card/streak-card.component';
import { StudyHistoryChartComponent } from '../../shared/study-history-chart/study-history-chart.component';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    StatCardComponent,
    StreakCardComponent,
    StudyHistoryChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Study history</h1>
          <p class="subtitle">Your daily practice across all exams.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else if (history().length === 0) {
        <div class="empty-state">
          <div class="empty-icon"><mat-icon>monitoring</mat-icon></div>
          <p>
            No study activity yet. Answer some questions and your history will
            show up here.
          </p>
          <button mat-stroked-button routerLink="/">
            <mat-icon>grid_view</mat-icon> Browse exams
          </button>
        </div>
      } @else {
        @if (streak(); as s) {
          <app-streak-card class="streak" [streak]="s" />
        }

        <!-- KPI tiles -->
        <section class="kpis">
          <app-stat-card
            icon="quiz"
            color="#1976d2"
            tint="#e3f2fd"
            [value]="summary().total"
            label="Questions answered"
            sublabel="across all exams"
          />
          <app-stat-card
            icon="check_circle"
            color="#2e7d32"
            tint="#e8f5e9"
            [value]="summary().correct"
            label="Correct"
            [sublabel]="summary().accuracy + '% of all attempts'"
          />
          <app-stat-card
            icon="cancel"
            color="#ba1a1a"
            tint="#fdecea"
            [value]="summary().incorrect"
            label="Incorrect"
            sublabel="attempts to review"
          />
          <app-stat-card
            icon="calendar_month"
            color="#5e35b1"
            tint="#ede7f6"
            [value]="summary().days"
            label="Study days"
            [sublabel]="'since ' + (summary().firstDay | date: 'mediumDate')"
          />
        </section>

        <mat-card class="panel" appearance="outlined">
          <mat-card-header>
            <mat-card-title>Questions per day</mat-card-title>
            <mat-card-subtitle>
              When you studied and how it went
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <app-study-history-chart [data]="history()" />
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      .streak {
        display: block;
        margin-bottom: 20px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 20px;
      }
      .panel mat-card-content {
        padding-top: 8px;
      }
    `,
  ],
})
export class StatisticsComponent {
  private readonly examService = inject(ExamService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly historyResource = rxResource({
    stream: () => this.examService.getStudyHistory(),
  });
  // The streak banner is supplementary: on error it simply stays hidden.
  private readonly streakResource = rxResource({
    stream: () => this.examService.getStudyStreak(),
  });

  readonly history = computed(() => this.historyResource.value() ?? []);
  readonly streak = this.streakResource.value;
  readonly loading = this.historyResource.isLoading;

  readonly summary = computed(() => {
    const days = this.history();
    const total = days.reduce((sum, d) => sum + d.total, 0);
    const correct = days.reduce((sum, d) => sum + d.correct, 0);
    return {
      total,
      correct,
      incorrect: total - correct,
      days: days.length,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      firstDay: days[0]?.day ?? null,
    };
  });

  constructor() {
    effect(() => {
      const error = this.historyResource.error() as Error | undefined;
      if (error) {
        this.snackBar.open(error.message, 'Dismiss', { duration: 5000 });
      }
    });
  }
}
