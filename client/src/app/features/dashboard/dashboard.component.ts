import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { Exam } from '../../core/models';
import { ExamCardComponent } from '../../shared/exam-card/exam-card.component';
import { ImportDialogComponent } from './import-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ExamCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="header">
        <div>
          <h1>Your exams</h1>
          <p class="subtitle">Pick a certification to start practising.</p>
        </div>
        <button mat-flat-button color="primary" (click)="openImport()">
          <mat-icon>add</mat-icon> Import exam
        </button>
      </header>

      @if (loading()) {
        <div class="center"><mat-spinner diameter="48" /></div>
      } @else if (exams().length === 0) {
        <div class="empty">
          <mat-icon>inbox</mat-icon>
          <p>No exams yet. Import a JSON file to get started.</p>
          <button mat-stroked-button color="primary" (click)="openImport()">
            <mat-icon>upload_file</mat-icon> Import your first exam
          </button>
        </div>
      } @else {
        <div class="grid">
          @for (exam of exams(); track exam.id) {
            <app-exam-card
              [exam]="exam"
              (open)="openExam($event)"
              (delete)="deleteExam($event)"
            />
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
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
        color: rgba(0, 0, 0, 0.6);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
      }
      .center,
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 64px 0;
        color: rgba(0, 0, 0, 0.6);
        text-align: center;
      }
      .empty mat-icon {
        font-size: 48px;
        height: 48px;
        width: 48px;
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly examService = inject(ExamService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly exams = signal<Exam[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.examService.getExams().subscribe({
      next: (exams) => {
        this.exams.set(exams);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
  }

  openImport(): void {
    this.dialog
      .open(ImportDialogComponent, { width: '480px' })
      .afterClosed()
      .subscribe((exam: Exam | undefined) => {
        if (exam) {
          this.snackBar.open(`Imported "${exam.name}".`, 'OK', {
            duration: 3000,
          });
          this.load();
        }
      });
  }

  openExam(exam: Exam): void {
    this.router.navigate(['/exams', exam.id]);
  }

  deleteExam(exam: Exam): void {
    if (!confirm(`Delete "${exam.name}" and all its data?`)) {
      return;
    }
    this.examService.deleteExam(exam.id).subscribe({
      next: () => {
        this.exams.update((list) => list.filter((e) => e.id !== exam.id));
        this.snackBar.open('Exam deleted.', 'OK', { duration: 3000 });
      },
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }
}
