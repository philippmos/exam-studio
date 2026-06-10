// Default (production) build configuration — used by `ng build` and the Docker
// image. The URL is relative so the browser stays same-origin: nginx in the
// client container reverse-proxies /graphql to the API (no CORS needed).
export const environment = {
  production: true,
  graphqlUrl: '/graphql',
};
