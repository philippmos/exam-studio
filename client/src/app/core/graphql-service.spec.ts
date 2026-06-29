import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth-service';
import { GraphqlService } from './graphql-service';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GraphqlService', () => {
  let service: GraphqlService;
  let fetchApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchApi = vi.fn();
    // GraphqlService posts through the auth-aware (DPoP) fetcher, not HttpClient.
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { fetchApi } }],
    });
    service = TestBed.inject(GraphqlService);
  });

  it('POSTs the query and unwraps the data field', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ data: { ping: 'pong' } }));

    const result = await firstValueFrom(
      service.request<{ ping: string }>('query { ping }'),
    );

    expect(fetchApi).toHaveBeenCalledTimes(1);
    const [url, init] = fetchApi.mock.calls[0];
    expect(url).toContain('/graphql');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ query: 'query { ping }' });
    expect(result).toEqual({ ping: 'pong' });
  });

  it('throws the first GraphQL error message', async () => {
    fetchApi.mockResolvedValue(
      jsonResponse({ data: null, errors: [{ message: 'Boom' }] }),
    );

    await expect(
      firstValueFrom(service.request('query { boom }')),
    ).rejects.toThrowError('Boom');
  });
});
