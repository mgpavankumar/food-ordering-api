# Food Ordering API · Hono & Prisma

A PostgreSQL-backed food ordering learning project covering customers, restaurants, menus, orders, and reporting queries.

**Author:** [M. G. Pavan Kumar](https://github.com/mgpavankumar)  
**Status:** Educational project

## Features

- Register customers and restaurants
- Manage menu items, prices, and availability
- Create orders and update order status
- Query customer orders, restaurant revenue, and popular items

## Getting started

Install Node.js and npm. Clone this repository:

```bash
git clone https://github.com/mgpavankumar/nitrogen.git
cd nitrogen
```

For local development, create `.env` in the repository root:

```dotenv
DATABASE_URL="postgresql://app_user:replace_with_local_password@localhost:5432/nitrogen_dev?schema=public"
```

Replace the placeholder values with your local PostgreSQL settings. Keep `.env` out of version control.

```bash
npm install
npm exec --package=prisma@6.5.0 -- prisma generate
npm exec --package=prisma@6.5.0 -- prisma db push
npm run dev
```

## Project structure

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Customer, restaurant, menu, order, and reporting routes |
| `src/prisma.ts` | Prisma client export |
| `prisma/schema.prisma` | Relational models and order status enum |

## Current behavior and limitations

Create a local `.env` with `DATABASE_URL` first. Prisma CLI is not declared in package.json, so these commands use a temporary CLI matching the declared Prisma client version. Use a fresh development database for db push; review schema changes before accepting them. Order creation is not transactional and can leave partial records on failure. A menu item is not checked against the selected restaurant, and quantities need stronger validation. The code registers `/customers/top` twice. There is no authentication.

## Routes declared in the source

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

## Planned improvements

- Add a local Prisma CLI dependency and migrations
- Create orders atomically with validated quantities and restaurant ownership
- Remove duplicate routes and add access control

## Contributing

Open an issue describing the problem or proposed improvement. Keep pull requests focused and include the steps used to verify changes. Use sample data and keep credentials out of commits.

## Verification

This documentation was checked against the committed source files, dependency declarations, and route definitions. Installation, compilation, database setup, and runtime behavior have not been verified by this documentation update. There is no automated test suite in the current repository.
