import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';

interface GraphqlResponse<T> {
  data: T;
  errors?: { message: string }[];
}

/**
 * Thin GraphQL client over HttpClient. Deliberately minimal (no cache layer):
 * every call posts a query + variables and unwraps `data` / surfaces errors.
 */
@Injectable({ providedIn: 'root' })
export class GraphqlService {
  private readonly http = inject(HttpClient);

  request<T>(query: string, variables?: Record<string, unknown>): Observable<T> {
    return this.http
      .post<GraphqlResponse<T>>(environment.graphqlUrl, { query, variables })
      .pipe(
        map((response) => {
          if (response.errors?.length) {
            throw new Error(response.errors[0].message);
          }
          return response.data;
        }),
      );
  }
}
