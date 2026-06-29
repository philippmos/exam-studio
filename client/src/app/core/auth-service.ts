import { Injectable, signal } from '@angular/core';
import { Auth0Client, User, createAuth0Client } from '@auth0/auth0-spa-js';

import { environment } from '../../environments/environment';

/** Namespaces DPoP nonce storage for our API in the auth0-spa-js fetcher. */
const API_NONCE_ID = 'exam-studio-api';

/** The slice of the auth0-spa-js fetcher this app relies on. */
interface ApiFetcher {
  fetchWithAuth(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Thin, signal-based wrapper around the framework-agnostic `@auth0/auth0-spa-js`
 * SDK (chosen over `@auth0/auth0-angular`, which still targets Angular 19).
 *
 * Configured for modern SPA best practice: Authorization Code + PKCE, refresh
 * token rotation, an **in-memory** token cache (no localStorage, so XSS cannot
 * read tokens) and **DPoP** (`useDpop`) so access tokens are sender-constrained.
 * API calls go through the SDK's fetcher (`fetchApi`), which mints a per-request
 * DPoP proof and manages the DPoP nonce/retry handshake automatically.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private client?: Auth0Client;
  private fetcher?: ApiFetcher;

  /** True until the initial Auth0 bootstrap (and any redirect) has settled. */
  readonly isLoading = signal(true);
  readonly isAuthenticated = signal(false);
  readonly user = signal<User | null>(null);

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
      // Best-practice token handling: rotated refresh tokens, in-memory cache.
      useRefreshTokens: true,
      cacheLocation: 'memory',
      // Sender-constrain tokens with DPoP (RFC 9449).
      useDpop: true,
    });

    if (this.hasRedirectParams()) {
      let target = '/';
      try {
        const result = await this.client.handleRedirectCallback();
        target = (result?.appState as { target?: string })?.target || '/';
      } catch (err) {
        console.error('Auth0 redirect callback failed', err);
      }
      // Restore the originally requested URL and drop ?code/&state, no reload.
      window.history.replaceState({}, document.title, target);
    }

    this.fetcher = this.client.createFetcher({
      dpopNonceId: API_NONCE_ID,
    }) as ApiFetcher;
    await this.refreshState();
    this.isLoading.set(false);
  }

  /** Start the login (and self-service registration) redirect to Auth0. */
  async login(targetUrl?: string): Promise<void> {
    await this.client?.loginWithRedirect({
      appState: {
        target: targetUrl ?? window.location.pathname + window.location.search,
      },
    });
  }

  /** Log out locally and end the Auth0 session, returning to the app origin. */
  async logout(): Promise<void> {
    await this.client?.logout({
      logoutParams: { returnTo: window.location.origin },
    });
  }

  /**
   * Authenticated, DPoP-bound fetch to our API. The SDK fetcher attaches the
   * access token (`Authorization: DPoP …`) and a fresh DPoP proof per request.
   */
  async fetchApi(url: string, init?: RequestInit): Promise<Response> {
    if (!this.fetcher) {
      throw new Error('AuthService is not initialised yet.');
    }
    return this.fetcher.fetchWithAuth(url, init);
  }

  private hasRedirectParams(): boolean {
    const search = window.location.search;
    return (
      /[?&](code|error)=/.test(search) && /[?&]state=/.test(search)
    );
  }

  private async refreshState(): Promise<void> {
    const authenticated = (await this.client?.isAuthenticated()) ?? false;
    this.isAuthenticated.set(authenticated);
    this.user.set(authenticated ? ((await this.client?.getUser()) ?? null) : null);
  }
}
