import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Styles the confirm button as a destructive (red) action. */
  destructive?: boolean;
}

/** Material replacement for the native `confirm()` dialog. */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        [class.destructive]="data.destructive"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .message {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.5;
      }
      .destructive {
        --mat-button-filled-container-color: var(--mat-sys-error);
        --mat-button-filled-label-text-color: var(--mat-sys-on-error);
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  /** Opens the dialog; emits `true` only when the user confirmed. */
  static open(
    dialog: MatDialog,
    data: ConfirmDialogData,
  ): Observable<boolean | undefined> {
    return dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
        ConfirmDialogComponent,
        { data, width: '420px' },
      )
      .afterClosed();
  }
}
