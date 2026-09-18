# Vercel deployment and catalogue recovery

## Verified diagnosis (17 September 2026)

- Failed commit `2550551` compiled and passed TypeScript on Vercel, then failed collecting `/_not-found`: `new URL('')` in `app/layout.tsx`. `??` does not treat an empty environment value as missing. Reproduced locally against that exact commit with `NEXT_PUBLIC_SITE_URL=` and `next build --webpack`.
- Current main already contained three subsequent commits correcting `??` to `||`. URL configuration is now centralized, trims whitespace and falls back to Vercel's hostname (localhost in development). Invalid nonempty URLs produce a clear configuration error.
- All ten production variables were present **with empty values**. In particular there is no usable `DATABASE_URL`, so the production database's schema and row counts cannot be inspected. An empty database or failed import cannot honestly be confirmed until a real connection string is supplied. Missing runtime configuration is a confirmed blocker.
- Routes exist under `/api/products`, `/api/product-variants` and `/api/admin/*`; they use same-origin requests, with no separate public API host required. Previously a database error returned HTTP 200 and the UI could display nine demo products. Failures now return 503 and an honest unavailable state.
- PostgreSQL required fixes to case-insensitive search, analytics grouping and bigint/count handling. Budget filtering now uses the displayed in-stock variant price. Draft variants cannot be fetched publicly.
- The checkout supplied to this task was a source download without `.git`; metadata was restored from the existing repository's `main`, preserving history.

## Build settings

Existing Vercel project: `debashens-projects/gentwelve`, existing GitHub repository: `debashen/gentwelve`, branch `main`, root `.`. Framework: Next.js. Install: `pnpm install --frozen-lockfile`. Build: `pnpm build`. Leave output directory at the Next.js default. `package.json` pins Node 22.x and pnpm; do not use static export.

The build uses Next's supported Webpack builder because local Turbopack worker startup failed in this execution environment. This is separate from the confirmed Vercel URL error. Database clients connect lazily. Database routes, product pages and sitemap remain dynamic; migration/import never run during install or build. Verify with all application variables absent or empty.

References: [Next CLI builders](https://nextjs.org/docs/app/api-reference/cli/next), [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

## Environment values

`.env.example` contains names with empty placeholders only. Replace the existing empty Vercel values under **Production**, and configure Preview independently if testing there. Redeploy after changing values. Do not put server secrets behind a `NEXT_PUBLIC_` prefix.

| Variable | Value to configure |
| --- | --- |
| `DATABASE_URL` | PostgreSQL provider connection string, preferably its pooled serverless endpoint; TLS required remotely |
| `AUTH_SECRET` | Strong random session signing secret, at least 32 random bytes |
| `ADMIN_PASSWORD` | Unique strong catalogue admin password |
| `AMROD_USERNAME` | Amrod Vendor API username |
| `AMROD_PASSWORD` | Amrod Vendor API password |
| `AMROD_CUSTOMER_CODE` | Your Amrod customer code |
| `AMROD_SYNC_KEY` | Strong random key for the authenticated import endpoint; same value in GitHub Actions |
| `NEXT_PUBLIC_SITE_URL` | Existing Vercel application URL, including `https://`; blank falls back to Vercel hostname |
| `AMROD_MARKUP_RATE` | Optional decimal; blank defaults to `0.35` |
| `AMROD_COST_VAT_RATE` | Optional decimal; blank defaults to `0.15` |
| `SYNC_BASE_URL` | CLI/Actions only: HTTPS URL of the migrated Vercel app, never the Sites URL |

Do not print credentials, fetch response bodies or bearer tokens into logs. Supplier authentication and API calls stay in server modules. API error messages are sanitized. Preview deployments should use a separate database if they will import or modify products.

## Database and first import

From a trusted local terminal, put the production values into an ignored `.env.local`, then:

```sh
pnpm db:migrate
pnpm db:check
pnpm catalogue:sync full
pnpm db:check
```

The full sync requires a running deployed app with those same database and supplier settings. Set `SYNC_BASE_URL` to that app and `AMROD_SYNC_KEY` to its key. Full import runs products → variants → enrichment → prices → stock. It resumes saved running datasets. Each request is limited to a chunk; the server allows up to 300 seconds. Enable Vercel Fluid compute/a plan supporting that duration. A failure rolls back that chunk; rerun the command to resume.

Alternatively sign into `/admin`: Import products → Import prices → Import stock. Keep the page open until completion. The product import also prepares variants and enrichment. Review `/admin/catalogue`, then use its existing confirmed bulk-publication action. Imports preserve existing publishing and merchandising decisions; genuinely new products begin as drafts.

`db:check` distinguishes missing configuration, missing schema, empty catalogue, absent pricing/stock, unpublished records and publicly visible counts. Expected historical baseline: 4,137 products. A fresh Amrod snapshot may differ; reconcile product codes against an approved original export before claiming exact parity. This repository contains no export of the old Sites database or its editorial publishing state. No access or changes to that live database are part of these fixes.

Reconciliation tracks supplier presence independently of admin edits. Successful full snapshots retire missing products and clear stock/prices absent from their respective complete snapshots. Empty/truncated supplier snapshots are rejected before cleanup. Imports are serialized and chunk writes are transactional. The existing upstream API is re-read for each remote chunk; run one importer at a time, and reconcile weekly to handle upstream feed changes during a long import.

## Scheduled maintenance

`.github/workflows/catalogue-sync.yml` runs daily changes/prices/stock Monday–Saturday at 02:17 UTC and a full reconciliation Sunday at 02:17 UTC. Full reconciliation includes price and stock refresh. GitHub scheduling is best-effort. Both jobs share a concurrency group. The workflow has a manual daily/full selector and reports nonzero failures.

Set repository **Actions secrets** `SYNC_BASE_URL` and `AMROD_SYNC_KEY`, then enable Actions on the default branch. These credentials belong to the migrated application only. Do not invoke the admin importer while a scheduled job is running. If Vercel Deployment Protection blocks machine requests, use the production Vercel URL accessible to the runner or explicitly configure an approved bypass; this script refuses redirects. Cron work is run across multiple bounded API calls, not squeezed into one Vercel cron request.

## Acceptance checks and cutover boundary

- Build, lint, typecheck and unit tests pass with no database configuration.
- Migrate twice: second execution makes no changes.
- `db:check`: real product, variant, price and stock counts; no incomplete imports.
- Public filters/search/budget use current published in-stock products; variant colour, size and quantity agree with Amrod; zero-stock products stay visible in admin only.
- Mobile admin list, bulk publishing, product detail links and WhatsApp product/quantity/colour/size enquiry details remain functional.
- Verify daily and full workflows after configuring secrets, and inspect failure notifications.

A green deployment alone does not restore data. Supply real environment values, migrate, import and publish before claiming catalogue readiness. Do not connect the public domain, change DNS, delete or redeploy the existing Sites website as part of this work.

## Validation completed in this repair

- Locked dependency install succeeded; no dependency-version changes were required.
- `pnpm lint`: passed, with 14 existing `next/image` optimization warnings; remote image behavior and styling were preserved.
- `pnpm typecheck`: passed.
- `pnpm build`: passed without application credentials, including the previously failing blank site URL case.
- `pnpm test` with disposable PostgreSQL: all six tests passed. Integration assertions cover public/category/case-insensitive/budget queries, exact variant stock, drafts and zero stock, admin authentication, numeric IDs, bulk publishing, analytics grouping, product routes, sitemap, variant retirement and failed-import rollback.
- Both migrations applied successfully; a second migration run was a no-op.
- Compiled client JavaScript contained no Amrod credential or database environment references.

The local runtime was Node 25; deployment pins Node 22. The Vercel build is the production Node 22 verification. Live supplier import and exact 4,137-product reconciliation remain blocked by empty production configuration.

## WhatsApp sales contact

Migration `003_sales_contact.sql` adds a separate contact table and seeds the default
contact with Debashen and the previously configured business number. Apply
`pnpm db:migrate` before deploying this version. It does not modify catalogue data.
Administrators can edit the name and international number in `/admin/catalogue`
under **WhatsApp / Sales Contact**. Settings persist in PostgreSQL. The uncached
`/api/whatsapp` redirect resolves the default contact on each click, including links
on already-open pages. Product enquiries include quantity, branding, a product-page
URL and any selected colour/size. Contact IDs allow later expansion; there is no
salesperson routing. If settings cannot be loaded, enquiries show a retry message
instead of silently sending to an outdated contact. No new dependencies are needed.
