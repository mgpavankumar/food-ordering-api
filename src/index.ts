import { Server } from 'node:http';
import { getPort, requireDatabase, registerShutdown } from './operations.js';
import "dotenv/config";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";

requireDatabase();
const prisma = new PrismaClient();
const server = serve({ fetch: createApp(prisma).fetch, port: getPort() }, info => {
  console.log(`Server is running on http://localhost:${info.port}`);
});
if (!(server instanceof Server)) throw new Error('Expected an HTTP/1 server');
server.requestTimeout = 15000;
server.headersTimeout = 10000;
registerShutdown(server, () => prisma.$disconnect());
