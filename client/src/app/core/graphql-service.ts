import { Injectable, inject } from '@angular/core';
import { Observable, defer, from } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth-service';

interface GraphqlResponse<T> {
  data: T;
  errors?: { message: string }[];
}

/**
 * Resolves the GraphQL endpoint to an absolute URL, handling both the relative
 * `/graphql` used behind nginx and the dev server's absolute URL.
 */
function resolveGraphqlUrl(): string {
  return new URL(environment.graphqlUrl, window.location.origin).toString();
}

/**
 * Thin GraphQL client. Requests go through {@link AuthService.fetchApi}, which
 * attaches the Bearer access token. Every call posts a query + variables and
 * unwraps `data` / surfaces errors; a 401 bounces the user through Auth0 again.
 */
@Injectable({ providedIn: 'root' })
export class GraphqlService {
  private readonly auth = inject(AuthService);
  private readonly url = resolveGraphqlUrl();

  request<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Observable<T> {
    // `defer` keeps the call cold: it fires per subscription, like HttpClient.
    return defer(() => from(this.execute<T>(query, variables)));
  }

  private async execute<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.auth.fetchApi(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 401) {
      // A freshly-minted token rejected by the API is a server-side validation
      // problem (e.g. AUTH0_AUDIENCE mismatch, clock skew), not an expired
      // token — re-logging-in would just loop. Surface the reason instead.
      let detail = 'Unauthorized';
      try {
        detail =
          ((await response.json()) as { detail?: string })?.detail ?? detail;
      } catch {
        /* non-JSON body */
      }
      const message = `The API rejected your session (401): ${detail}`;
      this.auth.reportError(message);
      throw new Error(message);
    }
    if (!response.ok) {
      throw new Error(`GraphQL request failed (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as GraphqlResponse<T>;
    if (body.errors?.length) {
      throw new Error(body.errors[0].message);
    }
    return body.data;
  }
}
