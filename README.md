# Food Ordering API · Hono & Prisma

[![CI](https://github.com/mgpavankumar/nitrogen/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mgpavankumar/nitrogen/actions/workflows/ci.yml)

A PostgreSQL-backed food ordering API with validated requests and transactional order creation.

**Author:** [M. G. Pavan Kumar](https://github.com/mgpavankumar)
**Status:** Educational project

## Features

- Manage customers, restaurants, menus, and orders
- Reject unavailable or cross-restaurant items and invalid quantities
- Create orders and their items atomically
- Report completed-order revenue and popular items

## Getting started

Install Node.js 22 or newer and npm. Clone this repository:

```bash
git clone https://github.com/mgpavankumar/nitrogen.git
cd nitrogen
```

```bash
npm ci
```

Copy `.env.example` to `.env` and set `DATABASE_URL` for a dedicated local PostgreSQL database. Keep `.env` out of version control. Then run:

```bash
npm run db:generate
npm run db:migrate
npm run build
npm start
```

`npm start` runs the TypeScript entry point with the Node.js `tsx` loader. `npm run build` emits JavaScript into `dist/src`. `npm run dev` watches source files. The server listens on port 3000 unless `PORT` is set.

## Tests

Use a dedicated test database with the migrations applied. Set `TEST_DATABASE_URL` to its connection URL before running `npm test`. Tests create synthetic records and clean up only their own records. GitHub Actions provisions PostgreSQL 16 and runs migrations, compilation, and tests.

```bash
npm run typecheck
npm test
```

See [TEST_RESULTS.md](TEST_RESULTS.md) for recorded local verification and its limits.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app.ts` | HTTP application, routes, and request validation |
| `src/index.ts` | Server entry point |
| `src/prisma.ts` | Application logic and/or demonstration |
| `tests/` | Automated regression checks |
| `tsconfig.json` | Strict ESM compilation settings |
| `prisma/schema.prisma` | Database models |
| `prisma/migrations/` | Versioned SQL migrations |
| `.env.example` | Placeholder local configuration |

## Current behavior and limitations

This learning API has no authentication or access control. Revenue includes completed orders only. Totals are calculated with decimal arithmetic, but the existing database totalPrice column remains a floating-point field. Existing databases previously initialized with db push need the initial migration baselined after confirming the schema matches.

## HTTP routes

| Method | Path |
| --- | --- |
| GET | `/` |
| POST | `/customers` |
| GET | `/customers/top` |
| GET | `/customers/:id` |
| GET | `/customers/:id/orders` |
| POST | `/restaurants` |
| GET | `/restaurants/:id/menu` |
| POST | `/restaurants/:id/menu` |
| PATCH | `/menu/:id` |
| POST | `/orders` |
| GET | `/orders/:id` |
| PATCH | `/orders/:id/status` |
| GET | `/restaurants/:id/revenue` |
| GET | `/menu/top-items` |

## Try the API

Use a local development database:

```bash
curl -i http://localhost:3000/customers -H 'Content-Type: application/json' -d '{"name":"Demo Customer","email":"demo@example.test","phoneNumber":"synthetic-demo-001","address":"Test address"}'
curl -i http://localhost:3000/restaurants -H 'Content-Type: application/json' -d '{"name":"Demo Kitchen","location":"Test location"}'
```

Both successful creations return HTTP 201. Use the returned IDs to add menu items and create orders; [the integration tests](tests/api.test.ts) show the complete sequence, including completed-order revenue. On Windows PowerShell use `curl.exe`.

## Contributing

Keep changes focused, use synthetic data, and include steps or tests demonstrating the fix. Do not commit local configuration or credentials.
