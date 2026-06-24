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
