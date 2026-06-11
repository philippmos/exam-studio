import { expect, test } from '@playwright/test';

test.describe('health endpoint', () => {
  test('reports the API as healthy', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('serves the GraphQL endpoint', async ({ request }) => {
    const response = await request.post('/graphql', {
      data: { query: 'query { __typename }' },
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).data).toEqual({ __typename: 'Query' });
  });
});
