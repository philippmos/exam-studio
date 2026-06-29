import { Injectable, signal } from '@angular/core';
import { Auth0Client, User, createAuth0Client } from '@auth0/auth0-spa-js';

import { environment } from '../../environments/environment';

/**
 * Thin, signal-based wrapper around the framework-agnostic `@auth0/auth0-spa-js`
 * SDK (chosen over `@auth0/auth0-angular`, which still targets Angular 19).
 *
 * Configured for Authorization Code + PKCE with rotating refresh tokens. The
 * token cache uses localStorage so a full page reload restores the session via
 * the refresh-token grant — no interactive redirect/consent, and no dependency
 * on the (often blocked) third-party-cookie silent iframe. Refresh-token
 * rotation + reuse detection (enabled in Auth0) mitigate the localStorage
 * exposure. Access tokens are sent to the API as Bearer tokens.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private client?: Auth0Client;

  /** True until the initial Auth0 bootstrap (and any redirect) has settled. */
  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);
  readonly user = signal<User | null>(null);
  /** Set when login/redirect fails, so the UI can show it instead of looping. */
  readonly error = signal<string | null>(null);

  /**
   * Bootstraps the Auth0 client and consumes a login redirect if present.
   * Run once from an APP_INITIALIZER so auth state is known before routing.
   */
  async init(): Promise<void> {
    if (environment.auth0.domain.startsWith('YOUR_')) {
      console.warn(
        'Auth0 is not configured: set environment.auth0 (see docs/auth0-setup.md).',
      );
    }

    this.client = await createAuth0Client({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: environment.auth0.audience,
      },
      // Persist the rotating refresh token so a full page reload restores the
      // session via the refresh-token grant (no redirect/consent, no iframe).
      useRefreshTokens: true,
      cacheLocation: 'localstorage',
    });

    const params = new URLSearchParams(window.location.search);
    if (params.has('code') || params.has('error')) {
      let target = '/';
      if (params.has('error')) {
        // Auth0 redirected back with an error (e.g. the SPA is not authorized
        // for the API audience). Surface it rather than re-triggering login.
        this.error.set(
          params.get('error_description') ||
            params.get('error') ||
            'Login failed.',
        );
      } else {
        try {
          const result = await this.client.handleRedirectCallback();
          target = (result?.appState as { target?: string })?.target || '/';
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Login failed.');
        }
      }
      // Drop ?code/&state (or the error params); restore the deep link on success.
      window.history.replaceState(
        {},
        document.title,
        this.error() ? window.location.pathname : target,
      );
    } else {
      // Not a redirect — restore an existing session after a full page reload.
      // The route guard only starts an interactive login if this finds none.
      try {
        await this.client.getTokenSilently();
      } catch {
        /* No active session to restore. */
      }
    }

    await this.refreshState();
    this.isLoading.set(false);
  }

  /** Start the login (and self-service registration) redirect to Auth0. */
  async login(targetUrl?: string): Promise<void> {
    this.error.set(null);
    await this.client?.loginWithRedirect({
      appState: {
        target: targetUrl ?? window.location.pathname + window.location.search,
      },
    });
  }

  /** Surface an API/auth failure to the app shell without re-triggering login. */
  reportError(message: string): void {
    this.error.set(message);
  }

  /** Log out locally and end the Auth0 session, returning to the app origin. */
  async logout(): Promise<void> {
    await this.client?.logout({
      logoutParams: { returnTo: window.location.origin },
    });
  }

  /** Authenticated fetch to our API: attaches the Bearer access token. */
  async fetchApi(url: string, init: RequestInit = {}): Promise<Response> {
    if (!this.client) {
      throw new Error('AuthService is not initialised yet.');
    }
    const token = await this.client.getTokenSilently();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  }

  private async refreshState(): Promise<void> {
    const authenticated = (await this.client?.isAuthenticated()) ?? false;
    this.isAuthenticated.set(authenticated);
    this.user.set(authenticated ? ((await this.client?.getUser()) ?? null) : null);
  }
}
