import { Injectable } from '@angular/core';

export interface Auth0Config {
  domain: string;
  clientId: string;
  audience: string;
}

/** Runtime configuration shape, mirrored by `config.template.json`. */
export interface AppConfig {
  graphqlUrl: string;
  auth0: Auth0Config;
}

/**
 * Holds the application's *runtime* configuration so the same build can run in
 * any environment ("build once, deploy anywhere"). The config is fetched from
 * `/config.json` once, before the app boots (see the app initializer in
 * `app.config.ts`):
 *
 * - **Docker:** nginx renders `config.json` from environment variables at
 *   container start (see `docker-entrypoint.d/40-render-config.sh`).
 * - **Local dev (`npm start`):** it is served from `public/config.json`.
 *
 * `load()` must resolve before any consumer calls {@link get}.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config?: AppConfig;

  /** Fetch `/config.json`. Called once from an app initializer. */
  async load(): Promise<void> {
    const response = await fetch('/config.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(
        `Failed to load runtime config from /config.json (HTTP ${response.status}). ` +
          'In dev, copy client/public/config.json.example to ' +
          'client/public/config.json (see docs/auth0-setup.md).',
      );
    }
    this.config = (await response.json()) as AppConfig;
  }

  /** The loaded configuration. Throws if accessed before {@link load}. */
  get(): AppConfig {
    if (!this.config) {
      throw new Error('ConfigService.get() called before load() completed.');
    }
    return this.config;
  }
}
