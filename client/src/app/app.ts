import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navigation } from './shared/navigation/navigation';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navigation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-navigation />
    <main>
      <router-outlet />
    </main>
  `,
})
export class App {}
