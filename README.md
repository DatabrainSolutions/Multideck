# Multideck

A freight forwarding system with a .NET server and web client.

## Project Structure

```
multideck.client/                  → Web client and all browser-facing code
multideck.server/                  → .NET 10 Web API backend
multideck.server/Backend/          → Backend libraries and infrastructure
multideck.server/Backend/supabase/ → Supabase functions and migrations
AGENTS.md                          → AI working instructions
design.md                          → Multideck design system direction
README.md                          → Project overview and run notes
```

Keep browser-facing application code inside `multideck.client`. Keep API code,
server-side libraries, database migrations, and Edge Functions inside
`multideck.server`.

## Running the Server

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)

### Run

```bash
cd multideck.server
dotnet run
```

The server starts at **`http://localhost:5273`** by default.

### Verify it's working

Open your browser and go to:

| URL | Description |
|---|---|
| `http://localhost:5273/` | Health check — should return "Multideck Server is running." |
| `http://localhost:5273/scalar/v1` | Scalar API documentation (interactive) |
| `http://localhost:5273/openapi/v1.json` | Raw OpenAPI spec |

> ⚠️ Scalar and OpenAPI are only available in **Development** mode (the default when running with `dotnet run`).

## API Logging

The API writes structured logs to the console and, when configured, Better Stack. Create a .NET source in Better Stack, then configure its source token and full ingesting endpoint using environment variables, user secrets, or deployment settings:

| Key | Required for Better Stack | Notes |
|---|---:|---|
| `BetterStack__SourceToken` | Yes | The source token from Better Stack. |
| `BetterStack__Endpoint` | Yes | The full source ingesting endpoint, for example `https://s123.eu-nbg-2.betterstackdata.com`. |

Example local setup:

```bash
cd multideck.server
dotnet user-secrets set "BetterStack:SourceToken" "your-source-token"
dotnet user-secrets set "BetterStack:Endpoint" "https://your-ingesting-host"
```

HTTP request events include `IpAddress`, plus `Username` when the request is authenticated. The username is the authenticated user's email for the current Supabase JWT configuration.

When the API runs behind a cloud proxy or load balancer, configure ASP.NET Core to trust that proxy's forwarded headers so `IpAddress` contains the user address rather than the proxy address. Prefer configuring the provider's proxy IP or network as trusted. If the API cannot be reached except through the trusted proxy, the hosting environment can instead set:

```text
ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
```

## Supabase Auth Setup

### Server

The API validates Supabase access tokens on protected endpoints such as `GET /api/auth/session`.

Set these values for `multideck.server` using environment variables, user secrets, or deployment settings:

| Key | Required | Notes |
|---|---:|---|
| `Supabase__Url` | Yes | Your project URL, for example `https://xxxx.supabase.co`. |
| `Supabase__JwtAudience` | No | Defaults to `authenticated`. |
| `Supabase__JwtIssuer` | No | Defaults to `{Supabase__Url}/auth/v1`. |
| `Supabase__JwtSecret` | Only for legacy HS256 projects | Leave empty for projects using Supabase JWKS/signing keys. |
| `Cors__AllowedOrigins__0` | Recommended | Client origin, for example `http://localhost:5173`. If omitted, local API allows any origin. |

Example local setup:

```bash
cd multideck.server
dotnet user-secrets set "Supabase:Url" "https://xxxx.supabase.co"
dotnet user-secrets set "Cors:AllowedOrigins:0" "http://localhost:5173"
```

### Client

Copy `multideck.client/.env.example` to `multideck.client/.env` and fill in:

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_MULTIDECK_TENANT_HOST=jenkar.multideck.app
VITE_API_BASE_URL=http://localhost:5273
```

`VITE_SUPABASE_ANON_KEY` remains supported for older deployments, but new environments should use the publishable key.

Each company is an isolated deployment backed by its own Supabase project and database. Bind every production build to one exact hostname with `VITE_MULTIDECK_TENANT_HOST`; the client fails closed if that build is opened from another company’s subdomain. Never put a Supabase secret or service-role key in the client.

In Supabase Auth settings:

- Turn off public user signups. Multideck accounts are created by an administrator or invitation only.
- Enable manual identity linking so signed-in users can connect optional providers from **Settings → Login & security**.
- Enable Google, LinkedIn (OIDC), Facebook, and Azure (Microsoft) with credentials from each provider's developer console.
- Use the tenant’s exact URL as the Site URL, for example `https://jenkar.multideck.app`. Do not add a cross-tenant wildcard.
- Use the same exact tenant hostname as the passkey relying-party ID and its HTTPS origin as the allowed origin. Keep it stable because changing it invalidates existing passkeys.
- Allow only that tenant’s exact production URL plus the local development redirects: `http://localhost:3000/**` and `http://127.0.0.1:3000/**`.

During the domain cutover, the current exact Vercel production URL may remain on the redirect allow list temporarily. Remove it after the tenant subdomain is serving the app; never replace it with a broad `*.vercel.app` rule.

`multideck.app` is the workspace router, not a shared customer database. It sends the user to the correct company subdomain before that tenant’s Supabase session is created. `jenkar.multideck.app` therefore uses the Jenkar Supabase project, while `databrain.multideck.app` uses a different project, database, Auth user store, API configuration, and set of provider credentials.

## Databrain support tickets

The authenticated **Settings → Support** form submits through the Multideck server to Databrain OS. Configure these values only on the server or in the Azure Web App deployment settings:

| Key | Required | Notes |
|---|---:|---|
| `SupportTickets__Endpoint` | Yes | Keep this set to `https://os.databrain.solutions/api/tickets`. |
| `SupportTickets__WebhookSecret` | Yes | Server-only integration secret. Never expose it through a `VITE_` variable. |
| `SupportTickets__SourceApplication` | Yes | Stable source name used for Databrain idempotency, normally `multideck`. |
| `SupportTickets__TimeoutSeconds` | No | Upstream timeout from 1–30 seconds; defaults to 10. |

Multideck resolves the requester and company from the signed-in account. Browser cookies, access tokens, and unrelated headers are not forwarded to Databrain OS.
