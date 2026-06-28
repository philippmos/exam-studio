import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

import { Exam, SessionMode, SessionSetup } from '../../core/models';

interface DialogData {
  exam: Exam;
  /** Questions currently due for spaced-repetition review. */
  dueCount: number;
}

@Component({
  selector: 'app-session-setup-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Start exam mode</h2>
    <mat-dialog-content>
      <p class="hint">How would you like to practise?</p>

      <mat-radio-group
        class="modes"
        [ngModel]="mode()"
        (ngModelChange)="mode.set($event)"
      >
        <mat-radio-button value="ALL_RANDOM">
          <span class="mode-title">All questions, shuffled</span>
          <span class="mode-desc"
            >Go through the whole exam in random order.</span
          >
        </mat-radio-button>

        <mat-radio-button value="BY_SECTION">
          <span class="mode-title">A specific module</span>
          <span class="mode-desc">Focus on the questions of one section.</span>
        </mat-radio-button>

        <mat-radio-button value="UNANSWERED">
          <span class="mode-title">Only not-yet-correct</span>
          <span class="mode-desc">
            Questions you have never answered correctly before.
          </span>
        </mat-radio-button>

        <mat-radio-button value="DUE_REVIEW" [disabled]="data.dueCount === 0">
          <span class="mode-title">
            Due for review
            @if (data.dueCount > 0) {
              <span class="badge">{{ data.dueCount }}</span>
            }
          </span>
          <span class="mode-desc">
            Spaced repetition — questions scheduled to come back today.
          </span>
        </mat-radio-button>
      </mat-radio-group>

      @if (mode() === 'BY_SECTION') {
        <mat-form-field appearance="outline" class="section-select">
          <mat-label>Module</mat-label>
          <mat-select
            [ngModel]="sectionId()"
            (ngModelChange)="sectionId.set($event)"
          >
            @for (section of data.exam.sections; track section.id) {
              <mat-option [value]="section.id">
                {{ section.name }} ({{ section.questionCount }})
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button [disabled]="!canStart()" (click)="start()">
        Start
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .hint {
        color: var(--mat-sys-on-surface-variant);
      }
      .modes {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin: 8px 0 4px;
      }
      .mode-title {
        display: block;
        font-weight: 500;
      }
      .mode-desc {
        display: block;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        white-space: normal;
      }
      .badge {
        display: inline-block;
        margin-left: 6px;
        padding: 0 7px;
        border-radius: 999px;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        font-size: 11px;
        font-weight: 600;
        line-height: 18px;
        vertical-align: middle;
      }
      .section-select {
        width: 100%;
        margin-top: 8px;
      }
      mat-dialog-content {
        min-width: 380px;
      }
    `,
  ],
})
export class SessionSetupDialog {
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<SessionSetupDialog, SessionSetup>,
  );

  // Default to reviewing when something is due, so spaced repetition is the
  // obvious next step; otherwise fall back to practising all questions.
  readonly mode = signal<SessionMode>(
    this.data.dueCount > 0 ? 'DUE_REVIEW' : 'ALL_RANDOM',
  );
  readonly sectionId = signal<string | null>(null);

  canStart(): boolean {
    return this.mode() !== 'BY_SECTION' || this.sectionId() !== null;
  }

  start(): void {
    this.dialogRef.close({
      mode: this.mode(),
      sectionId: this.mode() === 'BY_SECTION' ? this.sectionId() : null,
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
