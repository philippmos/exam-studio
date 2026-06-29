import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AuthService } from './auth-service';

/**
 * Blocks routes unless the user is authenticated. Because `AuthService.init()`
 * runs in an APP_INITIALIZER, auth state is already settled by the time the
 * router evaluates this; an unauthenticated visitor is sent through the Auth0
 * login redirect (which also offers self-service sign-up).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) {
    return true;
  }
  void auth.login(state.url);
  return false;
};
