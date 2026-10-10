import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a dedicated test database');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const app = createApp(prisma);
const customers: number[] = [], restaurants: number[] = [];
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
after(async () => {
  await prisma.customers.deleteMany({ where: { id: { in: customers } } });
  await prisma.restaurants.deleteMany({ where: { id: { in: restaurants } } });
  await prisma.$disconnect();
});
async function fixture() {
  const tag = randomUUID();
  const customer = await prisma.customers.create({ data: { name: 'Test', email: `${tag}@example.test`, phoneNumber: tag, address: 'Test address' } });
  const restaurant = await prisma.restaurants.create({ data: { name: tag, location: 'Test location' } });
  customers.push(customer.id); restaurants.push(restaurant.id);
  const menu = await prisma.menuItems.create({ data: { name: 'Test item', price: 0.1, restaurantId: restaurant.id } });
  return { customer, restaurant, menu };
}
test('customer, restaurant, menu, order, and reporting HTTP workflow', async () => {
  const tag = randomUUID();
  const cr = await app.request('/customers', json('POST', { name: 'Test', email: `${tag}@example.test`, phoneNumber: tag, address: 'Test' }));
  assert.equal(cr.status, 201); const customer = (await cr.json()).message; customers.push(customer.id);
  const rr = await app.request('/restaurants', json('POST', { name: tag, location: 'Test' }));
  assert.equal(rr.status, 201); const restaurant = (await rr.json()).message; restaurants.push(restaurant.id);
  const mr = await app.request(`/restaurants/${restaurant.id}/menu`, json('POST', { name: 'Test', price: 0.1 }));
  assert.equal(mr.status, 201); const menu = (await mr.json()).message;
  const body = { customerId: customer.id, restaurantId: restaurant.id, items: [{ menuItemId: menu.id, quantity: 3 }] };
  const response = await app.request('/orders', json('POST', body));
  assert.equal(response.status, 201); const order = (await response.json()).message;
  assert.equal(order.totalPrice, 0.3);
  assert.equal((await app.request(`/orders/${order.id}/status`, json('PATCH', { status: 'Completed' }))).status, 200);
  assert.equal((await (await app.request(`/restaurants/${restaurant.id}/revenue`)).json())._sum.totalPrice, 0.3);
  for (const route of [`/customers/${customer.id}`, `/customers/${customer.id}/orders`, `/restaurants/${restaurant.id}/menu`, `/orders/${order.id}`, '/customers/top', '/menu/top-items']) assert.equal((await app.request(route)).status, 200, route);
  assert.equal((await app.request(`/menu/${menu.id}`, json('PATCH', { isAvailable: false }))).status, 200);
  assert.equal((await (await app.request(`/restaurants/${restaurant.id}/menu`)).json())[0].MenuItems.length, 0);
});
test('invalid orders leave no partial orders or items', async () => {
  const { customer, restaurant, menu } = await fixture();
  const body = { customerId: customer.id, restaurantId: restaurant.id, items: [{ menuItemId: menu.id, quantity: 1 }, { menuItemId: 2147483647, quantity: 1 }] };
  assert.equal((await app.request('/orders', json('POST', body))).status, 400);
  assert.equal(await prisma.orders.count({ where: { customerId: customer.id } }), 0);
  assert.equal(await prisma.orderItem.count({ where: { menuItemId: menu.id } }), 0);
  for (const quantity of [0, -1, 1.5, '2']) assert.equal((await app.request('/orders', json('POST', { ...body, items: [{ menuItemId: menu.id, quantity }] }))).status, 400);
});
test('reject cross-restaurant and unavailable menu items', async () => {
  const first = await fixture(), second = await fixture();
  const body = { customerId: first.customer.id, restaurantId: first.restaurant.id, items: [{ menuItemId: second.menu.id, quantity: 1 }] };
  assert.equal((await app.request('/orders', json('POST', body))).status, 400);
  await prisma.menuItems.update({ where: { id: first.menu.id }, data: { isAvailable: false } });
  assert.equal((await app.request('/orders', json('POST', { ...body, items: [{ menuItemId: first.menu.id, quantity: 1 }] }))).status, 400);
  assert.equal(await prisma.orders.count({ where: { customerId: first.customer.id } }), 0);
});
test('invalid IDs, statuses, duplicates, and JSON', async () => {
  const { customer } = await fixture();
  assert.equal((await app.request('/customers/not-a-number')).status, 400);
  assert.equal((await app.request('/orders/2147483647')).status, 404);
  assert.equal((await app.request('/orders/1/status', json('PATCH', { status: 'Unknown' }))).status, 400);
  assert.equal((await app.request('/customers', json('POST', { name: 'Copy', email: customer.email, phoneNumber: customer.phoneNumber, address: 'Test' }))).status, 409);
  if (process.env.PGLITE_TEST === '1') await prisma.$disconnect();
  assert.equal((await app.request('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
});
