// Used by `npm start` / `ng serve` (development build configuration).
// The Angular dev server runs on :4200 and talks to the API on :8000 directly.
export const environment = {
  production: false,
  graphqlUrl: 'http://localhost:8000/graphql',
  // Auth0 SPA configuration. Fill these in from your Auth0 tenant — see
  // docs/auth0-setup.md. `audience` MUST match the API's AUTH0_AUDIENCE.
  // The same Auth0 application serves :4200 (dev) and :8080 (prod build) as
  // long as both origins are registered as allowed callback/web-origin URLs.
  auth0: {
    domain: 'YOUR_AUTH0_DOMAIN', // e.g. your-tenant.eu.auth0.com
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    audience: 'https://api.exam-studio',
  },
};
