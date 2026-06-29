import { Injectable, inject } from '@angular/core';
import { Observable, defer, from } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth-service';

interface GraphqlResponse<T> {
  data: T;
  errors?: { message: string }[];
}

/**
 * Absolute GraphQL endpoint URL. It must be absolute (and deterministic) so the
 * DPoP proof's `htu` claim the SDK generates matches what the API reconstructs.
 */
function resolveGraphqlUrl(): string {
  return new URL(environment.graphqlUrl, window.location.origin).toString();
}

/**
 * Thin GraphQL client. Requests go through {@link AuthService.fetchApi}, i.e.
 * the auth0-spa-js fetcher, so each call carries the access token and a
 * per-request DPoP proof. Every call posts a query + variables and unwraps
 * `data` / surfaces errors; a 401 bounces the user through Auth0 again.
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
      // Token expired or session gone — re-authenticate.
      await this.auth.login();
      throw new Error('Not authenticated.');
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
