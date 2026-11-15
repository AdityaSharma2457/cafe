import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { CafeError } from "@/lib/errors";

export type Dish = {
  id: number;
  name: string;
  description: string;
  price: number;
  available: boolean;
};

export type Category = {
  id: number;
  name: string;
  dishes: Dish[];
};

export type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

export type Order = {
  id: number;
  table: number;
  name: string;
  notes: string;
  total: number;
  status: "pending" | "delivered";
  createdAt: string;
  items: OrderItem[];
};

type DbRow = Record<string, string | number | null>;

const sessionSeconds = 8 * 60 * 60;
const sessions = new Map<string, number>();
const seedMenu = [
  ["Pizzas", [
    ["Margherita", "Tomato, fresh mozzarella, basil", 24900],
    ["Farmhouse", "Onion, capsicum, mushroom, tomato", 32900],
    ["Paneer Tikka", "Spiced paneer, onion, green chutney", 34900],
    ["Peppy Veggie", "Jalapeño, corn, olives, red paprika", 33900],
    ["Four Cheese", "Mozzarella, cheddar, parmesan, gouda", 39900],
  ]],
  ["Pastas", [
    ["Penne Arrabbiata", "Spicy tomato, garlic, chilli flakes", 22900],
    ["Alfredo Fettuccine", "Creamy white sauce, mushrooms", 27900],
    ["Pesto Fusilli", "Basil pesto, pine nuts, parmesan", 29900],
    ["Mac & Cheese", "Baked elbow pasta, cheddar crust", 25900],
  ]],
  ["Sides", [
    ["Garlic Bread", "Toasted, buttery, with cheese dip", 12900],
    ["Peri-Peri Fries", "Crispy fries, peri-peri seasoning", 11900],
  ]],
  ["Drinks", [
    ["Cold Coffee", "Thick, chilled, with ice cream", 14900],
    ["Fresh Lime Soda", "Sweet or salted", 8900],
    ["Masala Chai", "Hot, ginger and cardamom", 5900],
  ]],
] as const;

const databasePath = process.env.CAFE_DB_PATH
  ? path.resolve(process.env.CAFE_DB_PATH)
  : path.join(process.cwd(), "cafe.sqlite3");
const globalForCafe = globalThis as typeof globalThis & {
  cafeDatabase?: DatabaseSync;
};

function database(): DatabaseSync {
  if (!globalForCafe.cafeDatabase) {
    const db = new DatabaseSync(databasePath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS dishes (
        id INTEGER PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        name TEXT NOT NULL COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        price_paise INTEGER NOT NULL CHECK (price_paise > 0),
        available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(category_id, name)
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        table_number INTEGER NOT NULL CHECK (table_number BETWEEN 1 AND 3),
        customer_name TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        total_paise INTEGER NOT NULL CHECK (total_paise > 0),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'delivered')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        delivered_at TEXT
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        dish_id INTEGER REFERENCES dishes(id) ON DELETE SET NULL,
        dish_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
        unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise > 0)
      );
      CREATE INDEX IF NOT EXISTS orders_status_created
        ON orders(status, created_at);
      CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);
    `);
    if ((db.prepare("SELECT COUNT(*) AS count FROM categories").get() as DbRow).count === 0) {
      for (const [categoryName, dishes] of seedMenu) {
        const categoryResult = db.prepare("INSERT INTO categories(name) VALUES (?)").run(categoryName);
        const insertDish = db.prepare(
          "INSERT INTO dishes(category_id, name, description, price_paise) VALUES (?, ?, ?, ?)",
        );
        for (const [name, description, price] of dishes) {
          insertDish.run(categoryResult.lastInsertRowid, name, description, price);
        }
      }
    }
    globalForCafe.cafeDatabase = db;
  }
  return globalForCafe.cafeDatabase;
}

export function getCategories(includeUnavailable = false): Category[] {
  const db = database();
  const categories = db.prepare("SELECT id, name FROM categories ORDER BY id").all() as unknown as DbRow[];
  return categories.map((category) => {
    const dishRows = db.prepare(
      `SELECT id, name, description, price_paise, available
       FROM dishes WHERE category_id = ? ${includeUnavailable ? "" : "AND available = 1"}
       ORDER BY id`,
    ).all(category.id as number) as unknown as DbRow[];
    return {
      id: category.id as number,
      name: category.name as string,
      dishes: dishRows.map((dish) => ({
        id: dish.id as number,
        name: dish.name as string,
        description: dish.description as string,
        price: (dish.price_paise as number) / 100,
        available: Boolean(dish.available),
      })),
    };
  });
}

function orderDetails(row: DbRow): Order {
  const itemRows = database().prepare(
    "SELECT dish_name, quantity, unit_price_paise FROM order_items WHERE order_id = ? ORDER BY id",
  ).all(row.id as number) as unknown as DbRow[];
  return {
    id: row.id as number,
    table: row.table_number as number,
    name: row.customer_name as string,
    notes: row.notes as string,
    total: (row.total_paise as number) / 100,
    status: row.status as Order["status"],
    createdAt: row.created_at as string,
    items: itemRows.map((item) => ({
      name: item.dish_name as string,
      quantity: item.quantity as number,
      price: (item.unit_price_paise as number) / 100,
    })),
  };
}

export function getOrders() {
  const db = database();
  const pending = db.prepare(
    "SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at, id",
  ).all() as unknown as DbRow[];
  const delivered = db.prepare(
    `SELECT * FROM orders WHERE status = 'delivered'
     AND date(delivered_at) = date('now', 'localtime')
     ORDER BY delivered_at DESC, id DESC LIMIT 20`,
  ).all() as unknown as DbRow[];
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today_orders,
      SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN total_paise ELSE 0 END) AS today_sales
    FROM orders
  `).get() as DbRow;
  return {
    pending: pending.map(orderDetails),
    delivered: delivered.map(orderDetails),
    stats: {
      pending: stats.pending || 0,
      todayOrders: stats.today_orders || 0,
      todaySales: Number(stats.today_sales || 0) / 100,
    },
  };
}

export function getOrderStatus(id: number) {
  const row = database().prepare("SELECT id, status FROM orders WHERE id = ?").get(id) as DbRow | undefined;
  return row ? { id: row.id as number, status: row.status as string } : null;
}

export function createOrder(data: Record<string, unknown>) {
  const table = data.table;
  const name = data.name ?? "";
  const notes = data.notes ?? "";
  const items = data.items;
  if (!Number.isInteger(table) || ![1, 2, 3].includes(table as number)) {
    throw new CafeError("Please select a valid table.");
  }
  if (typeof name !== "string" || name.length > 80) throw new CafeError("Name must be 80 characters or fewer.");
  if (typeof notes !== "string" || notes.length > 500) throw new CafeError("Instructions must be 500 characters or fewer.");
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    throw new CafeError("Add at least one dish to your order.");
  }
  const quantities = new Map<number, number>();
  for (const item of items) {
    if (!item || typeof item !== "object") throw new CafeError("Order items are invalid.");
    const { dishId, quantity } = item as Record<string, unknown>;
    if (!Number.isInteger(dishId) || (dishId as number) <= 0 ||
      !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99) {
      throw new CafeError("Dish and quantity are invalid.");
    }
    const id = dishId as number;
    const count = (quantities.get(id) || 0) + (quantity as number);
    if (count > 99) throw new CafeError("A dish quantity cannot exceed 99.");
    quantities.set(id, count);
  }

  const db = database();
  const getDish = db.prepare(
    "SELECT id, name, price_paise FROM dishes WHERE id = ? AND available = 1",
  );
  const selectedDishes = [...quantities].map(([id, quantity]) => {
    const dish = getDish.get(id) as DbRow | undefined;
    if (!dish) throw new CafeError("A selected dish is no longer available. Refresh the menu.");
    return { dish, quantity };
  });
  const total = selectedDishes.reduce(
    (sum, { dish, quantity }) => sum + (dish.price_paise as number) * quantity,
    0,
  );
  db.exec("BEGIN");
  try {
    const result = db.prepare(
      "INSERT INTO orders(table_number, customer_name, notes, total_paise) VALUES (?, ?, ?, ?)",
    ).run(table as number, name.trim(), notes.trim(), total);
    const orderId = Number(result.lastInsertRowid);
    const insertItem = db.prepare(
      "INSERT INTO order_items(order_id, dish_id, dish_name, quantity, unit_price_paise) VALUES (?, ?, ?, ?, ?)",
    );
    for (const { dish, quantity } of selectedDishes) {
      insertItem.run(orderId, dish.id as number, dish.name as string, quantity, dish.price_paise as number);
    }
    db.exec("COMMIT");
    return { id: orderId, status: "pending" };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createCategory(name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 50) {
    throw new CafeError("Category name is required and must be 50 characters or fewer.");
  }
  const normalized = name.trim();
  const result = database().prepare("INSERT INTO categories(name) VALUES (?)").run(normalized);
  return { id: Number(result.lastInsertRowid), name: normalized };
}

function priceToPaise(price: unknown) {
  if (typeof price !== "number" || !Number.isFinite(price)) throw new CafeError("Enter a valid dish price.");
  if (price <= 0 || price > 1_000_000) {
    throw new CafeError("Price must be greater than ₹0 and no more than ₹10,00,000.");
  }
  const paise = Math.round((price + Number.EPSILON) * 100);
  if (paise < 1) throw new CafeError("Price must be at least ₹0.01.");
  return paise;
}

export function createDish(data: Record<string, unknown>) {
  const { name, description = "", categoryId, price } = data;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    throw new CafeError("Dish name is required and must be 80 characters or fewer.");
  }
  if (typeof description !== "string" || description.length > 250) {
    throw new CafeError("Description must be 250 characters or fewer.");
  }
  if (!Number.isInteger(categoryId) || (categoryId as number) <= 0) throw new CafeError("Choose a valid category.");
  const result = database().prepare(
    "INSERT INTO dishes(category_id, name, description, price_paise) VALUES (?, ?, ?, ?)",
  ).run(categoryId as number, name.trim(), description.trim(), priceToPaise(price));
  return { id: Number(result.lastInsertRowid) };
}

export function markDelivered(idValue: string, status: unknown) {
  if (!/^\d+$/.test(idValue) || status !== "delivered") {
    throw new CafeError("A valid order and delivered status are required.");
  }
  const id = Number(idValue);
  const db = database();
  const result = db.prepare(
    "UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ? AND status = 'pending'",
  ).run(id);
  if (result.changes === 0) {
    const exists = db.prepare("SELECT 1 FROM orders WHERE id = ?").get(id);
    if (!exists) throw new CafeError("Order not found.", 404);
    throw new CafeError("This order has already been delivered.", 409);
  }
  return { id, status: "delivered" };
}

export function updateDishAvailability(idValue: string, data: Record<string, unknown>) {
  if (!/^\d+$/.test(idValue) || Object.keys(data).length !== 1 || !("available" in data)) {
    throw new CafeError("Only dish availability can be changed here.");
  }
  if (typeof data.available !== "boolean") throw new CafeError("Availability must be true or false.");
  const id = Number(idValue);
  const result = database().prepare("UPDATE dishes SET available = ? WHERE id = ?").run(
    Number(data.available),
    id,
  );
  if (result.changes === 0) throw new CafeError("Dish not found.", 404);
  return { id, available: data.available };
}

export function newSessionToken() {
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, Date.now() + sessionSeconds * 1000);
  return token;
}

export function sessionDuration() {
  return sessionSeconds;
}

export function isAuthenticated(token: string | undefined) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function endSession(token: string | undefined) {
  if (token) sessions.delete(token);
}

export function verifyAdminPassword(password: unknown) {
  const expected = process.env.CAFE_ADMIN_PASSWORD || "";
  if (typeof password !== "string") return false;
  const actualHash = createHash("sha256").update(password).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash) && expected.length > 0;
}

export function isSqliteConflict(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
