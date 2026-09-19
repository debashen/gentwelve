# Gentwelve catalogue, sales and campaign implementation

## Catalogue reconciliation

The 19 September 2026 full response contained **4,140 parent products** and
**24,423 embedded variant SKUs**. It had no missing product codes/names, rejected
parents, duplicate parent codes or explicit inactive/discontinued flags. The prior
4,137 count was a parent count, not a truncation limit. The old variant extractor
also created parent-level pseudo-variants; these are now retired during preparation.
Supplier codes remain stable unique keys; existing publishing choices are retained.

The full stock feed contained 39,296 records. 24,423 sellable type-2 stock records
were imported; 14,873 other stock-type records were intentionally excluded. Duplicate
codes across stock types are expected and reported separately from product duplicates.
Prices and stock counts in Admin now count active variants. No extra products are
manufactured to match SKU counts.

Remote feeds are staged completely and transactionally before chunk processing.
Truncated responses and unsupported wrappers are rejected. Resumption reads the
same staged response, not a changing supplier feed. Both full-refresh actions run
products, variants, enrichment, prices and stock. Diagnostics persist after staged
payload cleanup. Weekly/daily CLI runs retain their existing schedule.

## Sales workspace and payment configuration

The admin picker searches code/name/category/brand, displays thumbnails, selling
prices and stock, and loads exact variant combinations and supplier branding methods
and positions. An administrator can explicitly override stock limits for incoming
stock quotations. Manual lines remain available. Issued documents retain their
product, variant, price, image and branding snapshots. Existing database triggers
continue to protect issued documents and received payments.

Gateway settings show Disabled, Not configured, Test mode or Ready. Configure in
Vercel Production (and Preview separately), redeploy, then enable the provider:

- Paystack: `PAYSTACK_SECRET_KEY` (`sk_test_...` / `sk_live_...`). Set the provider
  webhook to `https://catalogue.gentwelve.com/api/payments/webhooks/paystack`.
- PayFast: `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`,
  `PAYFAST_SANDBOX` explicitly `true` or `false`. Enable Onsite Payments and use
  the matching dashboard passphrase. ITN URL is supplied at checkout.
- Ozow: `OZOW_SITE_CODE`, `OZOW_PRIVATE_KEY`, `OZOW_API_KEY`, `OZOW_TEST_MODE`
  explicitly `true` or `false`. Approve the production domain in Ozow.
- EFT: complete the bank/account/branch fields in Sales Settings and enable EFT.
  Admin must verify the receipt against the bank statement before confirmation.
- `NEXT_PUBLIC_SITE_URL`: use `https://catalogue.gentwelve.com` for payment links.

No secret is entered in or returned to the browser. Browser returns never credit
payments. Existing signed-callback and independent provider verification remain in
place. Test payments do not reduce real balances. No real charge was performed.

## Supplier branding limitations

Actual product data uses `brandings[].method[]`, `positionName`, `brandingName`,
`brandingCode`, and `codeColourName` / `codeSizeName`. These are now mapped.
The catalogue feed supplies positions, methods, print dimensions, colour counts,
multiplier metadata and inclusive-branding descriptors, but no verified monetary
branding tariff/calculation contract. The vendor API landing page provides no
public schema; both Swagger schema locations checked returned 404.

Do not interpret an inclusive-branding descriptor as a universal free-price rule.
Admins enter confirmed selling charges; customers see that final branding prices
will be confirmed. A documented, account-authorised Amrod pricing/calculation API
would be needed before automating those charges. No guessed branding costs are
published. Replenishment dates are not invented when absent from the stored feed.

## Customer quote requests

The basket persists product selections in browser local storage; contact details
and artwork are not stored there. Up to 30 items can be edited on `/quote`. An
unknown quantity remains unknown in the request. When preparing a formal quote,
Admin sees a reminder and a provisional quantity of 1 to review before issuing.

Submission revalidates product publication, variants and branding against the
existing catalogue and stores a snapshot in `sales_enquiries.details`. It never
trusts customer-submitted prices or names. Requests use stable `GTQ-` references
and an idempotency key. The Sales enquiry opens a prefilled formal quotation and
reuses the existing quote/order/invoice/payment/delivery workflow.

Artwork is stored in PostgreSQL, limited to one 3 MB file per request. Accepted
formats are PDF, AI, EPS, SVG, PNG and JPEG with extension/signature checks and
active-content checks. Download routes require existing admin authentication and
serve attachments with no-sniff and a sandbox policy. There is no public artwork
bucket or detached public upload endpoint. The combined request is bounded below
Vercel's request-size limit. Same-origin validation, a honeypot and database-backed
per-IP hashed hourly limits protect submission. No new storage environment variables
are required. Database storage usage should be managed as request volume grows.

WhatsApp is offered after a successful saved request. Its message includes product
selections and the GTQ reference, excluding contact details, private notes and artwork.
The destination comes from the existing configurable sales contact.

## Campaigns

`/admin/campaigns` manages drafts, enabled status, schedules, priorities, imagery,
CTA paths, presentation types and category/product targeting. Dates are stored as
UTC and edited in the admin browser's local timezone. Active status is computed
at request time; no scheduler or redeployment is required. Existing open pages
refresh campaign visibility once per minute without blocking product content.

Popup frequency defaults to once per session, with per-campaign dismissal/view
state. One popup is shown per page visit. Other options are once per campaign,
once per X days and every visit. Native dialogs provide focus containment and
Escape dismissal. Campaign imagery is resized/compressed in the browser to WebP,
limited to 1 MB on the server, and served through immutable asset URLs.

Internal events count impressions, CTA clicks, dismissals and attributed product
views. A 30-day first-party browser attribution value links quote requests to a
campaign; Admin aggregates issued quotation value through those requests.
Analytics are lightweight and rate-limited; they are directional, not an ad-billing
ledger. Disabling a campaign removes it from new API responses immediately.

## Migrations and verification

- `007_sync_diagnostics.sql`: diagnostic JSON plus temporary supplier staging.
- `008_quote_requests_campaigns.sql`: enquiry references/idempotency, private artwork,
  rate-limit buckets, campaigns, public campaign images and internal events.
- Test against a disposable loopback database only. Set `TEST_DATABASE_URL` and,
  for PDF extraction checks, `PDFTOTEXT_BIN` to Poppler's pdftotext executable.
- Run migrations twice, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and
  `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.mjs`.
- PDF samples and browser screenshots are kept in ignored `outputs/sales-qa/`.

Verification on 19 September 2026: all 34 automated tests passed against a disposable
PostgreSQL database, including real API and generated-PDF checks. Production build
and TypeScript passed. ESLint passed with 27 warnings (primarily existing image
optimization guidance), no errors. Browser checks covered catalogue selection,
stock override, a persistent two-item basket and mobile Sales/basket layouts.
Migrations 007 and 008 were applied to production; a second migration run was a no-op.
The full supplier sync completed with 4,140 parent products and 24,423 sellable SKUs.
