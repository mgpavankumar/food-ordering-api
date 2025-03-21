import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { PrismaClient } from "./prisma";

const app = new Hono();
const prisma = new PrismaClient();

app.get("", (c) => {
  return c.text(
    "message : Hey this project about food ordering platform (online food ordering system)"
  );
});

//Intially create customer
app.post("/customers", async (c) => {
  try {
    const { name, email, phoneNumber, address } = await c.req.json();
    const existCustomer = await prisma.customers.findFirst({
      where: {
        OR: [{ email: email }, { phoneNumber: phoneNumber }],
      },
    });
    if (existCustomer) {
      return c.json({ message: "Customer already exists" }, 400);
    }
    const customer = await prisma.customers.create({
      data: {
        name,
        email,
        phoneNumber,
        address,
      },
    });
    console.log("Created Successfull");
    return c.json({ message: customer }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to create customer" }, 500);
  }
});

//Retrieve top customers
app.get("/customers/top", async (c) => {
  try {
    const topCustomers = await prisma.orders.groupBy({
      by: ["customerId"],
      _count: { customerId: true },
      orderBy: { _count: { customerId: "desc" } },
      take: 5,
    });

    const result = await Promise.all(
      topCustomers.map(async (entry) => {
        const customer = await prisma.customers.findUnique({
          where: { id: entry.customerId },
        });
        return { customer, orderCount: entry._count.customerId };
      })
    );

    return c.json(result);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to retrieve top customers" }, 500);
  }
});

//Display all customers
app.get("/customers/:id", async (c) => {
  try {
    const { id } = await c.req.param();
    const customer = await prisma.customers.findUnique({
      where: {
        id: Number(id),
      },
    });
    if (!customer) {
      return c.json({ message: "Customer not found" }, 404);
    }
    return c.json({ message: customer }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to get customer" }, 500);
  }
});

//Retrieve all orders placed by the customer
app.get("/customers/:id/orders", async (c) => {
  try {
    const { id } = await c.req.param();
    const orders = await prisma.orders.findMany({
      where: {
        customerId: Number(id),
      },
      include: {
        OrderItem: true,
      },
    });
    if (!orders) {
      return c.json({ message: "No orders found" }, 404);
    }
    return c.json({ message: orders }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to get customer orders" }, 500);
  }
});

//Register a new restaurant
app.post("/restaurants", async (c) => {
  const { name, location } = await c.req.json();
  try {
    const restaurant = await prisma.restaurants.create({
      data: {
        name,
        location,
      },
    });
    return c.json({ message: restaurant }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to create restaurant" }, 500);
  }
});

//retrive all available menu items from a restaurant
app.get("/restaurants/:id/menu", async (c) => {
  const restaurantId = Number(c.req.param("id"));

  try {
    const menuItems = await prisma.restaurants.findMany({
      where: { id: restaurantId },
      include: { MenuItems: true },
    });

    if (!menuItems) {
      return c.json({ message: "No available menu items found" }, 404);
    }

    return c.json(menuItems, 200);
  } catch (error) {
    console.error("Error in getting menu items:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Add a menu item to a restaurant
app.post("/restaurants/:id/menu", async (c) => {
  try {
    const restaurantId = Number(c.req.param("id")); // Extracting from URL
    const { name, price } = await c.req.json();

    // Check if the restaurant exists
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      return c.json({ message: "Restaurant not found, check Once" }, 404);
    }

    // Create the menu item
    const menuItem = await prisma.menuItems.create({
      data: {
        name,
        price: Number(price),
        restaurantId,
      },
    });

    return c.json({ message: menuItem }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ message: " Bad request" }, 500);
  }
});

//Update availability or price of a menu item
app.patch("/menu/:id", async (c) => {
  try {
    const { id } = await c.req.param();
    const { name, price, isAvailable } = await c.req.json();
    const menuItem = await prisma.menuItems.update({
      where: {
        id: Number(id),
      },
      data: {
        name,
        price,
        isAvailable,
      },
    });
    return c.json({ message: menuItem }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to update menu item" }, 500);
  }
});

//Place an order from restauranr
app.post("/orders", async (c) => {
  try {
    const { customerId, restaurantId, items } = await c.req.json();

    // Validate customer and restaurant
    const customer = await prisma.customers.findUnique({
      where: { id: Number(customerId) },
    });
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: Number(restaurantId) },
    });

    if (!customer) return c.json({ message: "Customer does not exist" }, 400);
    if (!restaurant)
      return c.json({ message: "Restaurant does not exist" }, 400);

    //  Create an Order
    const order = await prisma.orders.create({
      data: {
        customerId: Number(customerId),
        restaurantId: Number(restaurantId),
        status: "Placed",
        totalPrice: 0,
      },
    });

    let totalPrice = 0;

    for (const item of items) {
      const menuItem = await prisma.menuItems.findUnique({
        where: { id: Number(item.menuItemId) },
      });

      if (!menuItem || !menuItem.isAvailable) {
        return c.json(
          {
            message: `Menu item ID ${item.menuItemId} not found or unavailable`,
          },
          400
        );
      }

      const itemTotal = Number(menuItem.price) * item.quantity;
      totalPrice += itemTotal;

      // Create OrderItem table
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: menuItem.id,
          quantity: item.quantity,
        },
      });
    }

    // Step 3: Update  totalPrice
    const updatedOrder = await prisma.orders.update({
      where: { id: order.id },
      data: {
        totalPrice: totalPrice,
        status: "Placed",
      },
    });

    return c.json({ message: updatedOrder }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to place order" }, 500);
  }
});

//Retrieve details of a  order by id
app.get("/orders/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const order = await prisma.orders.findUnique({
      where: { id: Number(id) },
    });
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }
    return c.json(order, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to retrieve order" }, 500);
  }
});

// Update the status of an order
app.patch("/orders/:id/status", async (c) => {
  try {
    const { id } = c.req.param();
    const { status } = await c.req.json();
    const order = await prisma.orders.update({
      where: { id: Number(id) },
      data: { status },
    });
    return c.json(order, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to update order status" }, 500);
  }
});

//Get total revenue of  restaurant
app.get("/restaurants/:id/revenue", async (c) => {
  try {
    const { id } = c.req.param();
    const revenue = await prisma.orders.aggregate({
      where: { restaurantId: Number(id) },
      _sum: { totalPrice: true },
    });
    return c.json(revenue, 200);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to retrieve revenue" }, 500);
  }
});

// Top items of a restaurant
app.get("/menu/top-items", async (c) => {
  try {
    const topItems = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    });
    const menuItem = topItems[0]
      ? await prisma.menuItems.findUnique({
          where: { id: topItems[0].menuItemId },
        })
      : null;
    return c.json(menuItem);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to retrieve top menu items" }, 500);
  }
});

//Top 5 customers
app.get("/customers/top", async (c) => {
  try {
    const topCustomers = await prisma.orders.groupBy({
      by: ["customerId"],
      _count: { customerId: true },
      orderBy: { _count: { customerId: "desc" } },
      take: 5,
    });

    const result = await Promise.all(
      topCustomers.map(async (entry) => {
        const customer = await prisma.customers.findUnique({
          where: { id: entry.customerId },
        });
        return { customer, orderCount: entry._count.customerId };
      })
    );

    return c.json(result);
  } catch (error) {
    console.error(error);
    return c.json({ message: "Failed to retrieve top customers" }, 500);
  }
});

serve(app, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});