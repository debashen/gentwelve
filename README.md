# Gentwelve Product Discovery

Existing Next.js catalogue migrated from Sites to PostgreSQL and Vercel. The Sites deployment remains independent and must stay online. This project does not change DNS or that deployment. Keep the current UI, catalogue controls and WhatsApp flows.

See [deployment and recovery instructions](docs/VERCEL.md) for the verified failure, required configuration, initial import, schedules and verification.

## Local setup

Use Node 22 and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Populate DATABASE_URL and the other settings locally; never commit credentials.
pnpm db:migrate
pnpm db:check
pnpm dev
```

Local loopback PostgreSQL connections use no TLS. Remote connections require TLS; use the provider's connection string. Migrations load `.env.local`, preserve existing data and run transactionally once per file. No database or supplier connection is made during a build.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Integration tests use `TEST_DATABASE_URL` and a production build. **Only use a disposable loopback PostgreSQL database**: the test truncates its catalogue tables. Run migrations on it first. `TEST_DATABASE_URL=... pnpm test` starts its own test web server on port 3107. Normal unit tests need no credentials.

The 4,137-product historical catalogue is data, not a bundled seed. Import the current Amrod feed or restore an approved export of the original data. Do not replace the real catalogue with demonstration products. Fresh imports are drafts until reviewed and bulk published. Public counts exclude drafts, missing prices/images and zero-stock products, so they may be lower than the total imported count.
