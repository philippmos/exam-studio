import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { GraphqlService } from './graphql-service';

describe('GraphqlService', () => {
  let service: GraphqlService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GraphqlService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs the query and unwraps the data field', () => {
    let result: unknown;
    service
      .request<{ ping: string }>('query { ping }')
      .subscribe((data) => (result = data));

    const req = httpMock.expectOne(environment.graphqlUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      query: 'query { ping }',
      variables: undefined,
    });
    req.flush({ data: { ping: 'pong' } });

    expect(result).toEqual({ ping: 'pong' });
  });

  it('throws the first GraphQL error message', () => {
    let error: Error | undefined;
    service
      .request('query { boom }')
      .subscribe({ error: (e: Error) => (error = e) });

    httpMock
      .expectOne(environment.graphqlUrl)
      .flush({ data: null, errors: [{ message: 'Boom' }] });

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('Boom');
  });
});
