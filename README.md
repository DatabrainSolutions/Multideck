# Multideck App

Multideck App is the main operator application and the sole authoritative operational system for each tenant. It is one of three deliberately separate products; see the [canonical three-product architecture](docs/architecture/three-product-platform.md).

Each tenant uses a dedicated Vercel project named `multideck-app-{slug}`, an exact `{slug}.multideck.app` hostname, and one authoritative operational Supabase project shared with that tenant's Live deployment through separate authorised interfaces. Supabase is the production backend; there is no separate application server.

## Project Structure

```
multideck.client/                  → Web client and all browser-facing code
multideck.mobile/                  → React Native Android operator client
supabase/                          → Database migrations, Edge Functions, tests, and configuration
docs/                              → Architecture and agent policy documents
AGENTS.md                          → AI working instructions
design.md                          → Multideck design system direction
README.md                          → Project overview and run notes
```

Keep browser-facing application code inside `multideck.client`. Keep database
migrations, Edge Functions, and backend tests inside root `supabase`.

## Running the App

```bash
cd multideck.client
npm ci
npm run dev
```

The operator app runs on `http://127.0.0.1:3000`. The authenticated document centre is at `/documents`.

## Running the Android app

```bash
cd multideck.mobile
npm ci
npm run android
```

On first launch the operator enters the workspace slug, such as `dev`. The app resolves only
`https://dev.multideck.app/.well-known/multideck-mobile.json`, validates that the response belongs
to `dev`, and creates a Supabase client from that tenant's public configuration. Each tenant App
deployment emits this document from its own build-time environment. Service-role credentials are
never included.

There is no separate application server. Authentication, Postgres, Storage, Row Level Security,
RPCs, and server-side operations are owned by each tenant's isolated Supabase project.

## Local client

Requirements: Node.js 22+ and npm.

```powershell
cd multideck.client
Copy-Item .env.example .env.local
npm install
npm run dev
```

Configure the tenant's public values in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_MULTIDECK_TENANT_HOST=dev.multideck.app
VITE_MULTIDECK_ROOT_HOST=multideck.app
```

Never add a service-role key to client environment variables.

## Supabase

Requirements: Docker Desktop and the Supabase CLI.

```powershell
supabase login
cd supabase
supabase link --project-ref your-project-ref
supabase functions deploy account
supabase functions deploy team
supabase functions deploy customers
supabase functions deploy finance
supabase functions deploy warehouse
```

Edge Functions use the automatically provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. Set `APP_URL` as a function secret to the exact tenant application
origin. Public signup stays disabled; teammates are invited through the trusted `team` function.

The shared ERPNext finance demonstration is hosted at
`https://demo-finance.multideck.app`. Configure that exact origin as the tenant
Edge secret `ERPNEXT_BASE_URL`, alongside separately managed
`ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, and `ERPNEXT_WEBHOOK_SECRET` secrets.
This is the accounting-provider origin only: never use it for `APP_URL`,
`VITE_MULTIDECK_TENANT_HOST`, the Supabase Auth Site URL, or a passkey RP ID.

The current remote public-schema snapshot is stored at `supabase/baseline/public-schema.sql` for
new-tenant provisioning. Incremental reviewed changes belong in `supabase/migrations`.

## Checks

```powershell
cd multideck.client
npm run build

cd ../supabase
node --test tests/*.test.mjs
```
