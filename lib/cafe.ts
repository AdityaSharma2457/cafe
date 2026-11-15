import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
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

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = DbRow>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { last_row_id: number; changes: number } }>;
  all<T = DbRow>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

interface CafeEnvironment {
  DB?: D1Database;
  CAFE_ADMIN_PASSWORD?: string;
}

const sessionSeconds = 8 * 60 * 60;

async function cloudflareEnvironment(): Promise<CafeEnvironment> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as CafeEnvironment;
}

async function database(): Promise<D1Database> {
  const { DB } = await cloudflareEnvironment();
  const db = DB;
  if (!db) {
    throw new Error("Cloudflare D1 binding 'DB' not found. Please bind your D1 database as 'DB'.");
  }
  return db;
}

async function adminPassword(): Promise<string> {
  const password = (await cloudflareEnvironment()).CAFE_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("Cloudflare secret 'CAFE_ADMIN_PASSWORD' is not configured.");
  }
  return password;
}

export async function getCategories(includeUnavailable = false): Promise<Category[]> {
  const db = await database();
  const { results: categories } = await db
    .prepare("SELECT id, name FROM categories ORDER BY id")
    .all<DbRow>();

  return Promise.all(
    categories.map(async (category) => {
      const { results: dishRows } = await db
        .prepare(
          `SELECT id, name, description, price_paise, available
           FROM dishes WHERE category_id = ? ${includeUnavailable ? "" : "AND available = 1"}
           ORDER BY id`
        )
        .bind(category.id as number)
        .all<DbRow>();

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
    })
  );
}

async function orderDetails(db: D1Database, row: DbRow): Promise<Order> {
  const { results: itemRows } = await db
    .prepare("SELECT dish_name, quantity, unit_price_paise FROM order_items WHERE order_id = ? ORDER BY id")
    .bind(row.id as number)
    .all<DbRow>();

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

export async function getOrders() {
  const db = await database();
  const { results: pending } = await db
    .prepare("SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at, id")
    .all<DbRow>();

  const { results: delivered } = await db
    .prepare(
      `SELECT * FROM orders WHERE status = 'delivered'
       AND date(delivered_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes')
       ORDER BY delivered_at DESC, id DESC LIMIT 20`
    )
    .all<DbRow>();

  const stats = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes') THEN 1 ELSE 0 END) AS today_orders,
        SUM(CASE WHEN date(created_at, '+5 hours', '+30 minutes') = date('now', '+5 hours', '+30 minutes') THEN total_paise ELSE 0 END) AS today_sales
      FROM orders`
    )
    .first<DbRow>();

  return {
    pending: await Promise.all(pending.map((row) => orderDetails(db, row))),
    delivered: await Promise.all(delivered.map((row) => orderDetails(db, row))),
    stats: {
      pending: Number(stats?.pending || 0),
      todayOrders: Number(stats?.today_orders || 0),
      todaySales: Number(stats?.today_sales || 0) / 100,
    },
  };
}

export async function getOrderStatus(id: number) {
  const db = await database();
  const row = await db
    .prepare("SELECT id, status FROM orders WHERE id = ?")
    .bind(id)
    .first<DbRow>();
  return row ? { id: row.id as number, status: row.status as string } : null;
}

export async function createOrder(data: Record<string, unknown>) {
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
    if (
      !Number.isInteger(dishId) ||
      (dishId as number) <= 0 ||
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > 99
    ) {
      throw new CafeError("Dish and quantity are invalid.");
    }
    const id = dishId as number;
    const count = (quantities.get(id) || 0) + (quantity as number);
    if (count > 99) throw new CafeError("A dish quantity cannot exceed 99.");
    quantities.set(id, count);
  }

  const db = await database();
  const getDishStmt = db.prepare("SELECT id, name, price_paise FROM dishes WHERE id = ? AND available = 1");
  const selectedDishes = await Promise.all(
    [...quantities].map(async ([id, quantity]) => {
      const dish = await getDishStmt.bind(id).first<DbRow>();
      if (!dish) throw new CafeError("A selected dish is no longer available. Refresh the menu.");
      return { dish, quantity };
    })
  );

  const total = selectedDishes.reduce(
    (sum, { dish, quantity }) => sum + (dish.price_paise as number) * quantity,
    0
  );

  const orderResult = await db
    .prepare("INSERT INTO orders(table_number, customer_name, notes, total_paise) VALUES (?, ?, ?, ?)")
    .bind(table as number, name.trim(), notes.trim(), total)
    .run();

  const orderId = Number(orderResult.meta.last_row_id);
  const insertItemStmt = db.prepare(
    "INSERT INTO order_items(order_id, dish_id, dish_name, quantity, unit_price_paise) VALUES (?, ?, ?, ?, ?)"
  );

  const batchStatements = selectedDishes.map(({ dish, quantity }) =>
    insertItemStmt.bind(orderId, dish.id as number, dish.name as string, quantity, dish.price_paise as number)
  );

  if (batchStatements.length > 0) {
    await db.batch(batchStatements);
  }

  return { id: orderId, status: "pending" };
}

export async function createCategory(name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 50) {
    throw new CafeError("Category name is required and must be 50 characters or fewer.");
  }
  const normalized = name.trim();
  const db = await database();
  const result = await db
    .prepare("INSERT INTO categories(name) VALUES (?)")
    .bind(normalized)
    .run();
  return { id: Number(result.meta.last_row_id), name: normalized };
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

export async function createDish(data: Record<string, unknown>) {
  const { name, description = "", categoryId, price } = data;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    throw new CafeError("Dish name is required and must be 80 characters or fewer.");
  }
  if (typeof description !== "string" || description.length > 250) {
    throw new CafeError("Description must be 250 characters or fewer.");
  }
  if (!Number.isInteger(categoryId) || (categoryId as number) <= 0) throw new CafeError("Choose a valid category.");
  const db = await database();
  const result = await db
    .prepare("INSERT INTO dishes(category_id, name, description, price_paise) VALUES (?, ?, ?, ?)")
    .bind(categoryId as number, name.trim(), description.trim(), priceToPaise(price))
    .run();
  return { id: Number(result.meta.last_row_id) };
}

export async function markDelivered(idValue: string, status: unknown) {
  if (!/^\d+$/.test(idValue) || status !== "delivered") {
    throw new CafeError("A valid order and delivered status are required.");
  }
  const id = Number(idValue);
  const db = await database();
  const result = await db
    .prepare("UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ? AND status = 'pending'")
    .bind(id)
    .run();
  if (result.meta.changes === 0) {
    const exists = await db.prepare("SELECT 1 FROM orders WHERE id = ?").bind(id).first();
    if (!exists) throw new CafeError("Order not found.", 404);
    throw new CafeError("This order has already been delivered.", 409);
  }
  return { id, status: "delivered" };
}

export async function updateDishAvailability(idValue: string, data: Record<string, unknown>) {
  if (!/^\d+$/.test(idValue) || Object.keys(data).length !== 1 || !("available" in data)) {
    throw new CafeError("Only dish availability can be changed here.");
  }
  if (typeof data.available !== "boolean") throw new CafeError("Availability must be true or false.");
  const id = Number(idValue);
  const db = await database();
  const result = await db
    .prepare("UPDATE dishes SET available = ? WHERE id = ?")
    .bind(Number(data.available), id)
    .run();
  if (result.meta.changes === 0) throw new CafeError("Dish not found.", 404);
  return { id, available: data.available };
}

export async function deleteDish(idValue: string) {
  if (!/^\d+$/.test(idValue)) throw new CafeError("A valid dish is required.");
  const id = Number(idValue);
  const db = await database();
  const result = await db.prepare("DELETE FROM dishes WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) throw new CafeError("Dish not found.", 404);
  return { id, deleted: true };
}

export async function newSessionToken() {
  const expiresAt = Date.now() + sessionSeconds * 1000;
  const sig = createHmac("sha256", await adminPassword()).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${sig}`;
}

export function sessionDuration() {
  return sessionSeconds;
}

export async function isAuthenticated(token: string | undefined) {
  if (!token) return false;
  const [expiresAtStr, sig] = token.split(".");
  if (!expiresAtStr || !sig) return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expectedSig = createHmac("sha256", await adminPassword()).update(expiresAtStr).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

export async function verifyAdminPassword(password: unknown) {
  if (typeof password !== "string") return false;
  const expected = await adminPassword();
  const actualHash = createHash("sha256").update(password).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function isSqliteConflict(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
