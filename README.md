# Multideck

A freight forwarding system with a .NET server and web client.

## Project Structure

```
multideck.client/   → Web client
multideck.server/   → .NET 10 Web API backend
AGENTS.md           → AI working instructions
design.md           → Multideck design system direction
README.md           → Project overview and run notes
```

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
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_API_BASE_URL=http://localhost:5273
```

In Supabase Auth settings, add `http://localhost:5173/auth` to allowed redirect URLs for magic links and OAuth providers.
