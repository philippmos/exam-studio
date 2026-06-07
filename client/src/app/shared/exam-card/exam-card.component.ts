import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

import { Exam } from '../../core/models';

@Component({
  selector: 'app-exam-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="exam-card" appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ exam.name }}</mat-card-title>
        @if (exam.issuer) {
          <mat-card-subtitle>{{ exam.issuer }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        <div class="stats">
          <mat-chip-set>
            <mat-chip>
              <mat-icon matChipAvatar>folder</mat-icon>
              {{ exam.sections.length }} sections
            </mat-chip>
            <mat-chip>
              <mat-icon matChipAvatar>quiz</mat-icon>
              {{ exam.questionCount }} questions
            </mat-chip>
          </mat-chip-set>
        </div>
      </mat-card-content>
      <mat-card-actions align="end">
        <button mat-button color="warn" (click)="delete.emit(exam)">
          <mat-icon>delete</mat-icon> Delete
        </button>
        <button mat-flat-button color="primary" (click)="open.emit(exam)">
          Open <mat-icon>arrow_forward</mat-icon>
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      .exam-card {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      mat-card-content {
        flex: 1;
        padding-top: 12px;
      }
      .stats {
        margin-top: 8px;
      }
    `,
  ],
})
export class ExamCardComponent {
  @Input({ required: true }) exam!: Exam;
  @Output() open = new EventEmitter<Exam>();
  @Output() delete = new EventEmitter<Exam>();
}
