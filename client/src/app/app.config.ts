import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { AuthService } from './core/auth-service';
import { ConfigService } from './core/config-service';
import { ThemeService } from './core/theme-service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Load runtime config first, then bootstrap Auth0 (and consume any login
    // redirect) before the app renders, so the auth guard sees a settled
    // authentication state.
    provideAppInitializer(() => {
      const config = inject(ConfigService);
      const auth = inject(AuthService);
      const theme = inject(ThemeService);
      return config
        .load()
        .then(() => auth.init())
        .then(() => theme.syncFromServer());
    }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideAnimationsAsync(),
  ],
};
