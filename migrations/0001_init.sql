CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dishes (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  price_paise INTEGER NOT NULL CHECK (price_paise > 0),
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category_id, name)
);

CREATE TABLE orders (
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

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  dish_id INTEGER REFERENCES dishes(id) ON DELETE SET NULL,
  dish_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise > 0)
);

CREATE INDEX orders_status_created ON orders(status, created_at);
CREATE INDEX order_items_order ON order_items(order_id);

INSERT INTO categories (name) VALUES
  ('Pizzas'),
  ('Pastas'),
  ('Sides'),
  ('Drinks'),
  ('banti');

INSERT INTO dishes (category_id, name, description, price_paise) VALUES
  ((SELECT id FROM categories WHERE name = 'Pizzas'), 'Margherita', 'Tomato, fresh mozzarella, basil', 24900),
  ((SELECT id FROM categories WHERE name = 'Pizzas'), 'Farmhouse', 'Onion, capsicum, mushroom, tomato', 32900),
  ((SELECT id FROM categories WHERE name = 'Pizzas'), 'Paneer Tikka', 'Spiced paneer, onion, green chutney', 34900),
  ((SELECT id FROM categories WHERE name = 'Pizzas'), 'Peppy Veggie', 'Jalapeño, corn, olives, red paprika', 33900),
  ((SELECT id FROM categories WHERE name = 'Pizzas'), 'Four Cheese', 'Mozzarella, cheddar, parmesan, gouda', 39900),
  ((SELECT id FROM categories WHERE name = 'Pastas'), 'Penne Arrabbiata', 'Spicy tomato, garlic, chilli flakes', 22900),
  ((SELECT id FROM categories WHERE name = 'Pastas'), 'Alfredo Fettuccine', 'Creamy white sauce, mushrooms', 27900),
  ((SELECT id FROM categories WHERE name = 'Pastas'), 'Pesto Fusilli', 'Basil pesto, pine nuts, parmesan', 29900),
  ((SELECT id FROM categories WHERE name = 'Pastas'), 'Mac & Cheese', 'Baked elbow pasta, cheddar crust', 25900),
  ((SELECT id FROM categories WHERE name = 'Sides'), 'Garlic Bread', 'Toasted, buttery, with cheese dip', 12900),
  ((SELECT id FROM categories WHERE name = 'Sides'), 'Peri-Peri Fries', 'Crispy fries, peri-peri seasoning', 11900),
  ((SELECT id FROM categories WHERE name = 'Drinks'), 'Cold Coffee', 'Thick, chilled, with ice cream', 14900),
  ((SELECT id FROM categories WHERE name = 'Drinks'), 'Fresh Lime Soda', 'Sweet or salted', 8900),
  ((SELECT id FROM categories WHERE name = 'Drinks'), 'Masala Chai', 'Hot, ginger and cardamom', 5900),
  ((SELECT id FROM categories WHERE name = 'banti'), 'santi', '', 20000);
