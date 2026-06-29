// Default (production) build configuration — used by `ng build` and the Docker
// image. The URL is relative so the browser stays same-origin: nginx in the
// client container reverse-proxies /graphql to the API (no CORS needed).
export const environment = {
  production: true,
  graphqlUrl: '/graphql',
  // Auth0 SPA configuration. Fill these in from your Auth0 tenant — see
  // docs/auth0-setup.md. `audience` MUST match the API's AUTH0_AUDIENCE.
  auth0: {
    domain: 'pmo-software.eu.auth0.com', // e.g. your-tenant.eu.auth0.com
    clientId: 'AMJWQLhfVXM86RrxAKDZIwLhwDbw99rt',
    audience: 'https://api.exam-studio',
  },
};
