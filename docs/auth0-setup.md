# Auth0 setup — Exam Studio

Step-by-step configuration of an Auth0 tenant for Exam Studio. The app implements
the OAuth 2.0 **Authorization Code flow with PKCE** for the SPA and validates
**Bearer** access tokens at the API. Follow the steps in order; the values you
collect go into the two config locations listed in
[§7](#7-wire-the-values-into-exam-studio).

> Placeholders to replace: `YOUR_TENANT` (e.g. `dev-ab12cd.eu`), and the Client
> ID / domain you get from the dashboard. The API audience is a logical
> identifier you choose — this guide uses `https://api.exam-studio`.

---

## 1. Create the Auth0 tenant

1. Sign up / log in at <https://auth0.com> and note your **tenant domain**, e.g.
   `your-tenant.eu.auth0.com`. (Region matters: the domain must match exactly.)
2. Everything below is in the same tenant.

---

## 2. Create the API (the resource server)

**Dashboard → Applications → APIs → + Create API**

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| Name             | `Exam Studio API`                      |
| Identifier       | `https://api.exam-studio`              |
| Signing Algorithm| `RS256`                                |

- The **Identifier** is the **audience**. It never has to resolve to a real URL;
  it just has to match on both sides. → this becomes `AUTH0_AUDIENCE` (API) and
  `auth0.audience` (client). It is compared **exactly** (case- and slash-
  sensitive), so copy it verbatim.
- (Optional) Under **Permissions** you can define scopes later; not required for
  the current app (authorization is by data ownership, not scopes).

> This API **must exist before the SPA requests a token for it**, otherwise login
> fails with *"Client … is not authorized to access resource server …"* — see
> [Troubleshooting](#troubleshooting).

---

## 3. Create the SPA application

**Dashboard → Applications → Applications → + Create Application**

1. Name `Exam Studio Web`, type **Single Page Web Applications**, Create.
2. From **Settings**, copy the **Domain** and **Client ID** → these become
   `auth0.domain` and `auth0.clientId` in the client environment.
3. Configure the URLs (comma-separated — include both the dev server and the
   Docker/nginx origin):

   | Setting                    | Value                                          |
   | -------------------------- | ---------------------------------------------- |
   | Allowed Callback URLs      | `http://localhost:4200, http://localhost:8080` |
   | Allowed Logout URLs        | `http://localhost:4200, http://localhost:8080` |
   | Allowed Web Origins        | `http://localhost:4200, http://localhost:8080` |

   The app uses `window.location.origin` as the redirect URI, so the **origin**
   (no path) must be listed. Add your production origin here when you deploy.
4. **Advanced Settings → Grant Types**: ensure **Authorization Code** and
   **Refresh Token** are checked (Implicit/Password are not used). The app is a
   **public client** (no client secret).
5. **Refresh Token Rotation** (Settings → Refresh Token Rotation): enable
   **Rotation** and **Reuse detection** (absolute + inactivity expiration as you
   prefer). This pairs with the SPA's in-memory token cache.

> A SPA using the Authorization Code flow does **not** need to be explicitly
> authorized against the API (that step is only for machine-to-machine clients in
> §5). Once the API from §2 exists, the SPA can request tokens for its audience.

---

## 4. (Optional) Add email/name to the access token

By default an Auth0 **access token** for a custom API does *not* contain the
user's email/name (those live on the ID token). The API can store them if you
add them as **namespaced custom claims** via an Action.

**Dashboard → Actions → Triggers → post-login → + Add Action (custom)**:

```js
exports.onExecutePostLogin = async (event, api) => {
  const ns = 'https://exam-studio/';
  if (event.authorization) {
    api.accessToken.setCustomClaim(`${ns}email`, event.user.email);
    api.accessToken.setCustomClaim(`${ns}name`, event.user.name);
  }
};
```

Deploy it and drag it into the **post-login** flow. The namespace must match
`AUTH0_NAMESPACE` (default `https://exam-studio/`). Without this, the app still
works — users just have no email/name stored server-side (the SPA still shows
them from the ID token in the user menu).

---

## 5. (Optional) Machine-to-machine app for tests

The Playwright API suite needs a token but cannot do an interactive login.

**Applications → + Create Application → Machine to Machine** → authorize it for
**Exam Studio API** (no scopes needed). From its Settings take the **Client ID**
and **Client Secret** and fetch a token in the test setup:

```bash
curl --request POST \
  --url https://YOUR_TENANT.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{
    "client_id": "M2M_CLIENT_ID",
    "client_secret": "M2M_CLIENT_SECRET",
    "audience": "https://api.exam-studio",
    "grant_type": "client_credentials"
  }'
```

Send the returned `access_token` as `Authorization: Bearer <token>`. See
`api/e2e/README.md`.

---

## 6. Enable Attack Protection (recommended, OWASP)

**Dashboard → Security → Attack Protection** — turn on **Bot Detection**,
**Suspicious IP Throttling**, **Brute-force Protection** and **Breached Password
Detection**. This is Auth0's built-in defense against credential-stuffing and
brute-force, satisfying the OWASP authentication hardening guidance the app
relies on the IdP for.

---

## 7. Wire the values into Exam Studio

**API** — `.env` at the repo root (loaded by `app/config.py` and Docker):

```dotenv
AUTH0_DOMAIN=your-tenant.eu.auth0.com
AUTH0_AUDIENCE=https://api.exam-studio
```

**Client** — `client/src/environments/environment.ts` **and**
`environment.development.ts`:

```ts
auth0: {
  domain: 'your-tenant.eu.auth0.com',
  clientId: 'THE_SPA_CLIENT_ID',
  audience: 'https://api.exam-studio',   // must equal AUTH0_AUDIENCE
},
```

> `audience` on the client and `AUTH0_AUDIENCE` on the API **must be identical**,
> and must match the API Identifier from §2, otherwise login or token validation
> fails.

---

## 8. Run and verify

```bash
# API (repo root)
cd api && alembic upgrade head && uvicorn app.main:app --reload
# Client
cd client && npm install && npm start
```

1. Open <http://localhost:4200> → you are redirected to Auth0 to log in or
   **sign up** (the Auth0 Universal Login offers self-service registration).
2. After login you land back on the dashboard; the **user menu** (top-right)
   shows your name/email with a **Logout** action.
3. In DevTools → Network, `/graphql` requests carry `Authorization: Bearer …`.
4. Importing an exam attaches it to your user; a second account sees none of it.
5. A request without a token returns **HTTP 401**
   (`curl -i http://localhost:8000/graphql` → 401, `WWW-Authenticate: Bearer`).

---

## Troubleshooting

**`Client "…" is not authorized to access resource server "https://api.exam-studio"`**
— shown as a redirect back to `/?error=invalid_request&error_description=…`, and
the app then displays a "Sign-in failed" message instead of looping.

The SPA requested a token for an audience Auth0 does not recognise. Fix one of:

- The **API does not exist** with that identifier → create it (§2) with
  Identifier `https://api.exam-studio`.
- The **identifier does not match**. It is compared exactly (case-sensitive, a
  trailing slash counts). Make the API Identifier (Auth0),
  `environment.auth0.audience` (client) and `AUTH0_AUDIENCE` (API) all identical.
- **Wrong tenant/region** — confirm `domain` / `AUTH0_DOMAIN` is the tenant that
  contains the API.

After fixing, reload the app and use **Try again** / sign in.

**Login loops or "Callback URL mismatch"** — the app's origin
(`http://localhost:4200` or `http://localhost:8080`) is not in the SPA's Allowed
Callback / Web Origin URLs (§3).

---

## Security model recap (what Auth0 + the app give you)

- **Auth Code + PKCE**, public client, no secret in the browser.
- **In-memory tokens + refresh-token rotation** — no tokens in localStorage;
  rotation + reuse-detection limit the blast radius of a leak.
- **RS256 token validation** at the API (signature via JWKS, issuer, audience,
  expiry); `alg: none` is rejected.
- **Per-user data isolation** — every API query/mutation is scoped to the
  authenticated user (no IDOR/BOLA).
- **Attack Protection** at the IdP — brute-force / breached-password defense.
- Use **HTTPS** in production and register only HTTPS origins there.
