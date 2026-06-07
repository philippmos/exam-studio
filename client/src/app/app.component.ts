import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar color="primary" class="app-toolbar">
      <a routerLink="/" class="brand">
        <mat-icon>school</mat-icon>
        <span>Exam Studio</span>
      </a>
    </mat-toolbar>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [
    `
      .app-toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        color: inherit;
        text-decoration: none;
        font-weight: 500;
      }
    `,
  ],
})
export class AppComponent {}
