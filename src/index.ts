import "dotenv/config";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";

const prisma = new PrismaClient();
const server = serve({ fetch: createApp(prisma).fetch, port: Number(process.env.PORT ?? 3000) }, info => {
  console.log(`Server is running on http://localhost:${info.port}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); }); });
}
