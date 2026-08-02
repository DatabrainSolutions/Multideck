# Multideck

Multideck is a freight-forwarding workspace built as a React client backed entirely by Supabase.

## Repository structure

```text
multideck.client/  React and TypeScript application
supabase/          Database migrations, Edge Functions, tests, and configuration
```

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

The current remote public-schema snapshot is stored at `supabase/baseline/public-schema.sql` for
new-tenant provisioning. Incremental reviewed changes belong in `supabase/migrations`.

## Checks

```powershell
cd multideck.client
npm run build

cd ../supabase
node --test tests/*.test.mjs
```
