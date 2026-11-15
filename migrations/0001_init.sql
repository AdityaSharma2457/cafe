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

INSERT INTO dishes (category_id, name, description, price_paise)
SELECT id, 'Margherita', 'Tomato, fresh mozzarella, basil', 24900 FROM categories WHERE name = 'Pizzas'
UNION ALL SELECT id, 'Farmhouse', 'Onion, capsicum, mushroom, tomato', 32900 FROM categories WHERE name = 'Pizzas'
UNION ALL SELECT id, 'Paneer Tikka', 'Spiced paneer, onion, green chutney', 34900 FROM categories WHERE name = 'Pizzas'
UNION ALL SELECT id, 'Peppy Veggie', 'Jalapeño, corn, olives, red paprika', 33900 FROM categories WHERE name = 'Pizzas'
UNION ALL SELECT id, 'Four Cheese', 'Mozzarella, cheddar, parmesan, gouda', 39900 FROM categories WHERE name = 'Pizzas'
UNION ALL SELECT id, 'Penne Arrabbiata', 'Spicy tomato, garlic, chilli flakes', 22900 FROM categories WHERE name = 'Pastas'
UNION ALL SELECT id, 'Alfredo Fettuccine', 'Creamy white sauce, mushrooms', 27900 FROM categories WHERE name = 'Pastas'
UNION ALL SELECT id, 'Pesto Fusilli', 'Basil pesto, pine nuts, parmesan', 29900 FROM categories WHERE name = 'Pastas'
UNION ALL SELECT id, 'Mac & Cheese', 'Baked elbow pasta, cheddar crust', 25900 FROM categories WHERE name = 'Pastas'
UNION ALL SELECT id, 'Garlic Bread', 'Toasted, buttery, with cheese dip', 12900 FROM categories WHERE name = 'Sides'
UNION ALL SELECT id, 'Peri-Peri Fries', 'Crispy fries, peri-peri seasoning', 11900 FROM categories WHERE name = 'Sides'
UNION ALL SELECT id, 'Cold Coffee', 'Thick, chilled, with ice cream', 14900 FROM categories WHERE name = 'Drinks'
UNION ALL SELECT id, 'Fresh Lime Soda', 'Sweet or salted', 8900 FROM categories WHERE name = 'Drinks'
UNION ALL SELECT id, 'Masala Chai', 'Hot, ginger and cardamom', 5900 FROM categories WHERE name = 'Drinks'
UNION ALL SELECT id, 'santi', '', 20000 FROM categories WHERE name = 'banti';
