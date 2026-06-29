import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navigation } from './shared/navigation/navigation';
import { AuthService } from './core/auth-service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navigation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-navigation />
    <main>
      @if (auth.error(); as error) {
        <div class="auth-error" role="alert">
          <h2>Sign-in failed</h2>
          <p>{{ error }}</p>
          <button type="button" (click)="retry()">Try again</button>
        </div>
      } @else {
        <router-outlet />
      }
    </main>
  `,
  styles: [
    `
      .auth-error {
        max-width: 560px;
        margin: 64px auto;
        padding: 24px;
        text-align: center;
        border-radius: 16px;
        border: 1px solid
          color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
        background: color-mix(in srgb, var(--mat-sys-error) 8%, transparent);
      }
      .auth-error h2 {
        margin: 0 0 8px;
      }
      .auth-error p {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
        word-break: break-word;
      }
      .auth-error button {
        padding: 8px 18px;
        border: 0;
        border-radius: 999px;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        font-weight: 600;
        cursor: pointer;
      }
    `,
  ],
})
export class App {
  readonly auth = inject(AuthService);

  retry(): void {
    void this.auth.login();
  }
}
