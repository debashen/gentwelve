# Gentwelve Catalogue

Visual promotional-product catalogue for Gentwelve Printing Co. Built with Next.js for Vercel, PostgreSQL and the Amrod Vendor API.

## What is included

- Public searchable product catalogue
- Product detail pages with live variant stock
- WhatsApp quote enquiries
- Password-protected catalogue admin
- Publish, unpublish and merchandising controls
- Enquiry analytics
- Resumable Amrod product, price and stock imports

## Local setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and add the required values.
3. Create a PostgreSQL database.
4. Run `pnpm db:migrate`.
5. Run `pnpm dev`.

## Required environment variables

- `DATABASE_URL`
- `AUTH_SECRET`
- `ADMIN_PASSWORD`
- `AMROD_USERNAME`
- `AMROD_PASSWORD`
- `AMROD_CUSTOMER_CODE`
- `AMROD_SYNC_KEY`
- `NEXT_PUBLIC_SITE_URL`

Optional pricing settings:

- `AMROD_MARKUP_RATE`, defaults to `0.35`
- `AMROD_COST_VAT_RATE`, defaults to `0.15`

Never commit real credentials. Configure them in Vercel Project Settings.

## Deploying to Vercel

1. Import this GitHub repository into Vercel.
2. Add a PostgreSQL database and copy its connection string to `DATABASE_URL`.
3. add every required environment variable.
4. Run the SQL in `sql/001_initial.sql` against the production database.
5. Deploy and test the generated Vercel URL.
6. Run the Amrod imports from `/admin`.
7. Move `catalogue.gentwelve.com` only after the Vercel version matches the current live site.

The existing ChatGPT Sites deployment is independent and remains the fallback until the domain is deliberately moved.
