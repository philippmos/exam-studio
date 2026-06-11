import { APIRequestContext, expect } from '@playwright/test';

export interface GraphqlError {
  message: string;
}

export interface GraphqlResponse<T> {
  data?: T | null;
  errors?: GraphqlError[];
}

/**
 * Minimal GraphQL client on top of Playwright's APIRequestContext.
 *
 * `query` asserts the operation succeeded and unwraps `data`;
 * `expectError` asserts it failed and returns the first error message.
 */
export class GraphqlClient {
  constructor(private readonly request: APIRequestContext) {}

  /** Raw call returning the full GraphQL envelope (data + errors). */
  async execute<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<GraphqlResponse<T>> {
    const response = await this.request.post('/graphql', {
      data: { query, variables },
    });
    expect(
      response.ok(),
      `GraphQL endpoint answered HTTP ${response.status()}: ${await response
        .text()
        .catch(() => '<no body>')}`,
    ).toBeTruthy();
    return (await response.json()) as GraphqlResponse<T>;
  }

  /** Executes the operation and asserts it produced data without errors. */
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const body = await this.execute<T>(query, variables);
    expect(
      body.errors,
      `Expected operation to succeed, got: ${JSON.stringify(body.errors)}`,
    ).toBeUndefined();
    return body.data as T;
  }

  /** Executes the operation and asserts it failed; returns the error message. */
  async expectError(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<string> {
    const body = await this.execute<unknown>(query, variables);
    expect(
      body.errors?.length ?? 0,
      'Expected the operation to return a GraphQL error',
    ).toBeGreaterThan(0);
    return body.errors![0].message;
  }
}
