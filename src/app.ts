import { serviceAccess } from './service-access.js';
import { addOperations } from './operations.js';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const text = z.string().trim().min(1).max(200);
const price = z.number().finite().positive().max(1000000).multipleOf(0.01);
const customerSchema = z.object({ name: text, email: z.string().email(), phoneNumber: text, address: text }).strict();
const restaurantSchema = z.object({ name: text, location: text }).strict();
const menuSchema = z.object({ name: text, price, isAvailable: z.boolean().optional() }).strict();
const orderSchema = z.object({ customerId: z.number().int().positive(), restaurantId: z.number().int().positive(), items: z.array(z.object({ menuItemId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) }).strict()).min(1).max(100) }).strict();
const idFrom = (value: string) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HTTPException(400, { message: 'Invalid ID' });
  return id;
};

export function createApp(prisma: PrismaClient, options: { readiness?: () => Promise<unknown>; serviceKey?: string } = {}) {
  const app = new Hono();
  app.use('*', secureHeaders());
  addOperations(app, options.readiness ?? (() => prisma.$queryRaw`SELECT 1 FROM "Customers", "Restaurants", "MenuItems", "Orders", "OrderItem" WHERE FALSE`));
  app.use('*', bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ error: 'Request body exceeds 64 KiB' }, 413) }));
  app.use('*', serviceAccess(options.serviceKey));
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid request body' }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return c.json({ error: 'Record already exists' }, 409);
      if (error.code === 'P2025') return c.json({ error: 'Record not found' }, 404);
      if (error.code === 'P2003') return c.json({ error: 'Related record not found' }, 400);
    }
    console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
    return c.json({ error: 'Internal server error' }, 500);
  });
  app.get('/', c => c.text('Food Ordering API'));
  app.post('/customers', async c => c.json({ message: await prisma.customers.create({ data: customerSchema.parse(await c.req.json()) }) }, 201));
  app.get('/customers/top', async c => {
    const top = await prisma.orders.groupBy({ by: ['customerId'], _count: { customerId: true }, orderBy: { _count: { customerId: 'desc' } }, take: 5 });
    return c.json(await Promise.all(top.map(async entry => ({ customer: await prisma.customers.findUnique({ where: { id: entry.customerId } }), orderCount: entry._count.customerId }))));
  });
  app.get('/customers/:id', async c => {
    const customer = await prisma.customers.findUnique({ where: { id: idFrom(c.req.param('id')) } });
    if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
    return c.json({ message: customer });
  });
  app.get('/customers/:id/orders', async c => {
    const customerId = idFrom(c.req.param('id'));
    if (!await prisma.customers.findUnique({ where: { id: customerId } })) throw new HTTPException(404, { message: 'Customer not found' });
    return c.json({ message: await prisma.orders.findMany({ where: { customerId }, include: { OrderItem: true } }) });
  });
  app.post('/restaurants', async c => c.json({ message: await prisma.restaurants.create({ data: restaurantSchema.parse(await c.req.json()) }) }, 201));
  app.get('/restaurants/:id/menu', async c => {
    const id = idFrom(c.req.param('id'));
    const restaurant = await prisma.restaurants.findUnique({ where: { id }, include: { MenuItems: { where: { isAvailable: true } } } });
    if (!restaurant) throw new HTTPException(404, { message: 'Restaurant not found' });
    return c.json([restaurant]);
  });
  app.post('/restaurants/:id/menu', async c => {
    const restaurantId = idFrom(c.req.param('id'));
    const data = menuSchema.parse(await c.req.json());
    if (!await prisma.restaurants.findUnique({ where: { id: restaurantId } })) throw new HTTPException(404, { message: 'Restaurant not found' });
    return c.json({ message: await prisma.menuItems.create({ data: { ...data, restaurantId } }) }, 201);
  });
  app.patch('/menu/:id', async c => {
    const data = menuSchema.partial().parse(await c.req.json());
    if (!Object.keys(data).length) throw new HTTPException(400, { message: 'No update fields' });
    return c.json({ message: await prisma.menuItems.update({ where: { id: idFrom(c.req.param('id')) }, data }) });
  });
  app.post('/orders', async c => {
    const { customerId, restaurantId, items } = orderSchema.parse(await c.req.json());
    const order = await prisma.$transaction(async tx => {
      if (!await tx.customers.findUnique({ where: { id: customerId } })) throw new HTTPException(400, { message: 'Customer does not exist' });
      if (!await tx.restaurants.findUnique({ where: { id: restaurantId } })) throw new HTTPException(400, { message: 'Restaurant does not exist' });
      let total = new Prisma.Decimal(0);
      const lines = [];
      for (const item of items) {
        const menuItem = await tx.menuItems.findUnique({ where: { id: item.menuItemId } });
        if (!menuItem || !menuItem.isAvailable || menuItem.restaurantId !== restaurantId) throw new HTTPException(400, { message: 'Menu item is missing, unavailable, or belongs to another restaurant' });
        total = total.plus(menuItem.price.mul(item.quantity));
        lines.push({ menuItemId: item.menuItemId, quantity: item.quantity });
      }
      return tx.orders.create({ data: { customerId, restaurantId, totalPrice: Number(total.toFixed(2)), OrderItem: { create: lines } } });
    });
    return c.json({ message: order }, 201);
  });
  app.get('/orders/:id', async c => {
    const order = await prisma.orders.findUnique({ where: { id: idFrom(c.req.param('id')) } });
    if (!order) throw new HTTPException(404, { message: 'Order not found' });
    return c.json(order);
  });
  app.patch('/orders/:id/status', async c => {
    const { status } = z.object({ status: z.enum(['Placed', 'Preparing', 'Completed', 'Cancelled']) }).strict().parse(await c.req.json());
    return c.json(await prisma.orders.update({ where: { id: idFrom(c.req.param('id')) }, data: { status } }));
  });
  app.get('/restaurants/:id/revenue', async c => {
    const restaurantId = idFrom(c.req.param('id'));
    if (!await prisma.restaurants.findUnique({ where: { id: restaurantId } })) throw new HTTPException(404, { message: 'Restaurant not found' });
    return c.json(await prisma.orders.aggregate({ where: { restaurantId, status: 'Completed' }, _sum: { totalPrice: true } }));
  });
  app.get('/menu/top-items', async c => {
    const top = await prisma.orderItem.groupBy({ by: ['menuItemId'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 1 });
    return c.json(top[0] ? await prisma.menuItems.findUnique({ where: { id: top[0].menuItemId } }) : null);
  });
  return app;
}
