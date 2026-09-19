# Sales operations

Open `/admin/sales`. This adds an operational sales workflow; it is not an accounting ledger.

## Configure before issuing real documents

In **Settings → Business / Documents**, manually enter legal/trading names, registration,
contact information, addresses, logo, terms and banking details. Unknown details are
blank. No supplier banking information is used. PNG/JPEG logos up to 500 KB are stored
with settings and snapshotted into documents. VAT defaults to disabled; enabling it
requires a VAT number and rate. Selling prices entered into quotes are exclusive of
any configured VAT. With VAT disabled, no VAT is charged or printed.

Configure document prefixes and the next sequence. Numbers are allocated atomically
when issued and cannot be changed. Sequences cannot move backwards. Changing
customer details or settings affects future drafts, not issued documents. Drafts can
be edited; issued quotations cannot. Cancel documents instead of deleting them.

## Workflow

1. Record a received WhatsApp/manual enquiry, choose an existing customer, or start a
   manual quote. Customers can be created inside the quote editor. WhatsApp messages
   are not ingested automatically.
2. Add catalogue or manual lines. Set quantity, variants, selling price, product
   discount, per-unit branding, fixed setup and other charges, and delivery.
3. Save a draft; review the PDF; issue / mark sent. Share its private link yourself.
   This application does not automatically send messages or emails.
4. Customers view, download, accept or decline using a random 256-bit token. Treat
   these links as confidential bearer links. Expired quotes cannot be accepted.
5. Convert an accepted quote to a sales order. Repeated requests return the same order.
6. Share the order payment link. Record EFT receipt only after checking the bank.
7. Create an invoice with a due date and issue it. Payments can precede invoices and
   are linked when an invoice is created. Partial payments and balances are calculated
   from confirmed, non-test receipts. An invoice is not automatically paid.
8. Update artwork/production/dispatch status and generate a delivery note. Delivery
   note PDFs omit monetary columns, totals and quotation notes. They have recipient,
   signature and delivery fields; electronic signing is not implemented.

There is currently one invoice per order and full-order delivery notes. No credit notes,
refund initiation, partial delivery allocation, inventory reservation or bookkeeping
integration is included. Payment receipts and issued document content are protected
by database triggers. Audit records preserve important changes.

## Payments

Providers are independently enabled in Settings. Only enabled AND configured online
providers appear to customers. EFT requires complete banking information. All provider
credentials are environment variables, never settings fields or client bundles.

| Provider | Server environment variables |
| --- | --- |
| Paystack | `PAYSTACK_SECRET_KEY` |
| PayFast | `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, optional `PAYFAST_SANDBOX=true` |
| Ozow | `OZOW_SITE_CODE`, `OZOW_PRIVATE_KEY`, `OZOW_API_KEY`, optional `OZOW_TEST_MODE=true` |

Set `NEXT_PUBLIC_SITE_URL` to the live catalogue origin for payment callbacks. Configure
provider notifications at `/api/payments/webhooks/paystack`, `/payfast` or `/ozow`.
Paystack requires its webhook URL to be set in its merchant dashboard. PayFast Onsite
must be enabled for the merchant account. Its server-side initialization keeps even
the merchant key out of customer HTML. PayFast IP checks use Vercel's overwritten
forwarded-IP header; deployment behind an additional proxy requires review.

Paystack checks raw-body HMAC SHA512 and verifies the transaction through its API.
PayFast checks the ordered MD5/passphrase signature, merchant, source IP on Vercel,
amount, and server validation response. Ozow checks ordered SHA512 fields, site,
currency, amount, and independently queries its transaction API. All confirmations
match a stored payment attempt. Duplicate notifications are idempotent; test payments
never credit real order balances. Returning to a success page is navigation only.

Online providers must complete merchant sandbox/end-to-end verification with real
merchant credentials before enabling live payments. Automated tests mock the provider
APIs and cover invalid signatures and status mismatches; they do not certify merchant
account activation. No live transaction was initiated during implementation.

Official integration references:
- https://paystack.com/docs/payments/webhooks/
- https://paystack.com/docs/api/transaction/
- https://developers.payfast.co.za/
- https://ozow.com/integrations
- https://vercel.com/docs/headers/request-headers

## Deployment and validation

Migrations 004–006 add sales tables and indexes without changing product, variant or
sync records. Run migrations before each matching deployment. Existing catalogue and
admin authentication are reused. The original catalogue/sync regression suite remains.

`pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test` check the implementation.
Set `TEST_DATABASE_URL` only to a disposable loopback PostgreSQL database to run the
HTTP integration suites. They never run against a remote database. PDF QA fixtures
cover all four documents and multipage tables. No QA customers or documents are
inserted into production.
