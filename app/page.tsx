"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Category, Dish, Order } from "@/lib/cafe";

type CartLine = { dish: Dish; quantity: number };
type OrderSummary = {
  pending: Order[];
  delivered: Order[];
  stats: { pending: number; todayOrders: number; todaySales: number };
};

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(value);

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

function OrderCard({ order, pending, onDeliver }: {
  order: Order;
  pending: boolean;
  onDeliver: (id: number, button: HTMLButtonElement) => void;
}) {
  return (
    <article className="order-card">
      <div className="order-top">
        <div>
          <h3>Table {order.table}{order.name ? ` · ${order.name}` : ""}</h3>
          <span className="order-time">
            #{order.id} · {new Date(`${order.createdAt}Z`).toLocaleString()}
          </span>
        </div>
        <span className={pending ? "badge" : "badge off"}>{pending ? "NEW" : "DELIVERED"}</span>
      </div>
      <ul className="order-items">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span>{item.quantity} × {item.name}</span>
            <span>{money(item.quantity * item.price)}</span>
          </li>
        ))}
      </ul>
      {order.notes && <p className="order-meta">Note: {order.notes}</p>}
      <div className="order-total"><span>Total</span><span>{money(order.total)}</span></div>
      {pending && (
        <button className="delivered-btn" type="button" onClick={(event) => onDeliver(order.id, event.currentTarget)}>
          Mark delivered
        </button>
      )}
    </article>
  );
}

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [cart, setCart] = useState<Map<number, CartLine>>(() => new Map());
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [orderMessage, setOrderMessage] = useState("");
  const [menuError, setMenuError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState("Your order is in the kitchen queue.");
  const [modalOpen, setModalOpen] = useState(false);

  const [chefOpen, setChefOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [chefError, setChefError] = useState("");
  const [orderData, setOrderData] = useState<OrderSummary | null>(null);
  const [dishName, setDishName] = useState("");
  const [dishDescription, setDishDescription] = useState("");
  const [dishCategory, setDishCategory] = useState("");
  const [dishPrice, setDishPrice] = useState("");
  const [dishMessage, setDishMessage] = useState("");
  const [dishActionId, setDishActionId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");

  const total = useMemo(
    () => [...cart.values()].reduce((sum, line) => sum + line.quantity * line.dish.price, 0),
    [cart],
  );
  const currentDishes = useMemo(
    () => categories.flatMap((category) => category.dishes.map((dish) => ({ ...dish, categoryName: category.name }))),
    [categories],
  );

  const loadMenu = useCallback(async () => {
    try {
      const result = await api<{ categories: Category[] }>("/api/menu");
      setCategories(result.categories);
      setMenuError("");
    } catch (error) {
      setMenuError(error instanceof Error ? error.message : "Could not load the menu.");
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => { void loadMenu(); }, [loadMenu]);

  const refreshDashboard = useCallback(async () => {
    if (!authenticated || !chefOpen) return;
    try {
      const [orders, menu] = await Promise.all([
        api<OrderSummary>("/api/admin/orders"),
        api<{ categories: Category[] }>("/api/admin/menu"),
      ]);
      setOrderData(orders);
      setCategories(menu.categories);
      setChefError("");
      setDishCategory((current) => current && menu.categories.some((category) => String(category.id) === current)
        ? current
        : String(menu.categories[0]?.id || ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh the dashboard.";
      if (message.toLowerCase().includes("sign in")) setAuthenticated(false);
      setChefError(message);
    }
  }, [authenticated, chefOpen]);

  useEffect(() => {
    if (!authenticated || !chefOpen) return;
    void refreshDashboard();
    const timer = window.setInterval(() => { void refreshDashboard(); }, 10000);
    return () => window.clearInterval(timer);
  }, [authenticated, chefOpen, refreshDashboard]);

  useEffect(() => {
    if (!currentOrderId || !modalOpen) return;
    const check = async () => {
      try {
        const result = await api<{ status: string }>(`/api/orders/${currentOrderId}`);
        if (result.status === "delivered") {
          setOrderStatus("Delivered — enjoy your meal!");
          window.clearInterval(timer);
        }
      } catch (error) {
        setOrderStatus(`Could not refresh order status: ${error instanceof Error ? error.message : "Please try again."}`);
        window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(() => { void check(); }, 4000);
    return () => window.clearInterval(timer);
  }, [currentOrderId, modalOpen]);

  function changeQuantity(dish: Dish, change: number) {
    setCart((previous) => {
      const next = new Map(previous);
      const quantity = Math.max(0, Math.min(99, (next.get(dish.id)?.quantity || 0) + change));
      if (quantity) next.set(dish.id, { dish, quantity });
      else next.delete(dish.id);
      return next;
    });
  }

  async function placeOrder() {
    if (!cart.size) { setOrderMessage("Please add at least one dish."); return; }
    if (!selectedTable) { setOrderMessage("Please select your table."); return; }
    setOrderMessage("");
    setPlacingOrder(true);
    try {
      const result = await api<{ id: number }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          table: selectedTable,
          name: customerName.trim(),
          notes: notes.trim(),
          items: [...cart.values()].map(({ dish, quantity }) => ({ dishId: dish.id, quantity })),
        }),
      });
      setCurrentOrderId(result.id);
      setOrderStatus("Your order is in the kitchen queue.");
      setModalOpen(true);
    } catch (error) {
      setOrderMessage(error instanceof Error ? error.message : "Could not place your order.");
    } finally {
      setPlacingOrder(false);
    }
  }

  function finishOrder() {
    setModalOpen(false);
    setCurrentOrderId(null);
    setCart(new Map());
    setCustomerName("");
    setNotes("");
    setSelectedTable(null);
    setOrderMessage("");
  }

  async function openChef() {
    setChefOpen(true);
    setLoginMessage("");
    try {
      const result = await api<{ authenticated: boolean }>("/api/admin/session");
      setAuthenticated(result.authenticated);
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "Could not check chef session.");
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginMessage("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: loginPassword }) });
      setLoginPassword("");
      setAuthenticated(true);
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "Could not sign in.");
    }
  }

  async function signOut() {
    try {
      await api("/api/admin/logout", { method: "POST", body: "{}" });
      setAuthenticated(false);
      setOrderData(null);
    } catch (error) {
      setChefError(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  async function markDelivered(id: number, button: HTMLButtonElement) {
    button.disabled = true;
    try {
      await api(`/api/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "delivered" }),
      });
      await refreshDashboard();
    } catch (error) {
      button.disabled = false;
      setChefError(error instanceof Error ? error.message : "Could not update the order.");
    }
  }

  async function addDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDishMessage("");
    try {
      await api("/api/admin/dishes", {
        method: "POST",
        body: JSON.stringify({
          name: dishName.trim(),
          description: dishDescription.trim(),
          categoryId: Number(dishCategory),
          price: Number(dishPrice),
        }),
      });
      setDishName("");
      setDishDescription("");
      setDishPrice("");
      await refreshDashboard();
      setDishMessage("Dish added to the menu.");
    } catch (error) {
      setDishMessage(error instanceof Error ? error.message : "Could not add dish.");
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoryMessage("");
    try {
      await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name: categoryName.trim() }),
      });
      setCategoryName("");
      await refreshDashboard();
      setCategoryMessage("Category added.");
    } catch (error) {
      setCategoryMessage(error instanceof Error ? error.message : "Could not add category.");
    }
  }

  async function toggleDish(dish: Dish) {
    setDishActionId(dish.id);
    try {
      await api(`/api/admin/dishes/${dish.id}`, {
        method: "PATCH",
        body: JSON.stringify({ available: !dish.available }),
      });
      await refreshDashboard();
    } catch (error) {
      setChefError(error instanceof Error ? error.message : "Could not update dish availability.");
    } finally {
      setDishActionId(null);
    }
  }

  async function removeDish(dish: Dish) {
    const confirmed = window.confirm(
      `Delete ${dish.name} from the menu? Past orders will keep their saved item details.`,
    );
    if (!confirmed) return;

    setDishActionId(dish.id);
    setChefError("");
    try {
      await api(`/api/admin/dishes/${dish.id}`, { method: "DELETE" });
      await refreshDashboard();
    } catch (error) {
      setChefError(error instanceof Error ? error.message : "Could not delete this dish.");
    } finally {
      setDishActionId(null);
    }
  }

  return (
    <>
      <header className="site-header">
        <button className="admin-open" type="button" onClick={() => void openChef()}>
          {authenticated ? "Chef dashboard" : "Chef sign in"}
        </button>
        <h1>🍕 Dishu’s Cafe</h1>
        <p>Fresh from the oven · Made with love</p>
      </header>
      <main className="customer-main">
        <div id="menu">
          {menuError ? <p className="error">{menuError}</p> : null}
          {!menuError && menuLoading
            ? <p className="muted">Loading today’s menu…</p>
            : !menuError && categories.filter((category) => category.dishes.some((dish) => dish.available)).length === 0
              ? <p className="muted">Our menu is being prepared. Please check back soon.</p>
            : categories.map((category) => {
              const availableDishes = category.dishes.filter((dish) => dish.available);
              if (!availableDishes.length) return null;
              return (
                <section className="menu-section" key={category.id}>
                  <h2>{category.name}</h2>
                  {availableDishes.map((dish) => (
                    <div className="item" key={dish.id}>
                      <div>
                        <b>{dish.name}</b>
                        {dish.description && <small>{dish.description}</small>}
                      </div>
                      <div className="right">
                        <span className="price">{money(dish.price)}</span>
                        <div className="qty">
                          <button type="button" aria-label={`Remove one ${dish.name}`} onClick={() => changeQuantity(dish, -1)}>−</button>
                          <span>{cart.get(dish.id)?.quantity || 0}</span>
                          <button type="button" aria-label={`Add one ${dish.name}`} onClick={() => changeQuantity(dish, 1)}>+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
        </div>
        <section className="order-box" id="order">
          <h2>Your Order</h2>
          <ul className="summary">
            {!cart.size
              ? <li className="muted">No items added yet.</li>
              : [...cart.values()].map(({ dish, quantity }) => (
                <li key={dish.id}><span>{quantity} × {dish.name}</span><span>{money(quantity * dish.price)}</span></li>
              ))}
          </ul>
          <div className="total"><span>Total</span><span>{money(total)}</span></div>
          <div className="tables">
            {[1, 2, 3].map((table) => (
              <button
                type="button"
                key={table}
                className={`tile${selectedTable === table ? " sel" : ""}`}
                aria-pressed={selectedTable === table}
                onClick={() => { setSelectedTable(table); setOrderMessage(""); }}
              >
                Table {table}
              </button>
            ))}
          </div>
          <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={80} placeholder="Name (optional)" autoComplete="name" aria-label="Name" />
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={500} placeholder="Special instructions (optional)" aria-label="Special instructions" />
          <p className="form-message" role="status">{orderMessage}</p>
          <button className="primary" type="button" onClick={() => void placeOrder()} disabled={placingOrder}>
            {placingOrder ? "Placing order…" : "Place order"}
          </button>
          <p className="note">Your order goes straight to the cafe kitchen.</p>
        </section>
      </main>
      <footer>© Dishu’s Cafe</footer>

      {modalOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div className="box">
            <div className="ok">✅</div>
            <h2 id="modalTitle">Order received!</h2>
            <p>Table {selectedTable} · Order #{currentOrderId}</p>
            <div className="status-text" role="status">{orderStatus}</div>
            <button className="primary" type="button" onClick={finishOrder}>Done</button>
          </div>
        </div>
      )}

      {chefOpen && (
        <section className="chef-panel" aria-label="Chef dashboard">
          <div className="chef-header">
            <h1>☕ Chef dashboard</h1>
            <div className="actions">
              <button className="secondary" type="button" onClick={() => void refreshDashboard()}>Refresh</button>
              <button className="secondary" type="button" onClick={() => setChefOpen(false)}>Close</button>
            </div>
          </div>
          <div className="chef-main">
            {!authenticated ? (
              <div className="login-wrap">
                <h2>Chef sign in</h2>
                <p className="muted">Sign in to manage incoming orders and the cafe menu.</p>
                <form onSubmit={(event) => void signIn(event)}>
                  <input type="password" autoComplete="current-password" placeholder="Chef password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                  <p className="form-message error" role="alert">{loginMessage}</p>
                  <button className="primary" type="submit">Sign in</button>
                </form>
              </div>
            ) : (
              <>
                <div className="section-heading">
                  <div><h2>Kitchen overview</h2><span className="muted">Orders refresh automatically every 10 seconds.</span></div>
                  <button className="secondary" type="button" onClick={() => void signOut()}>Sign out</button>
                </div>
                {chefError && <p className="error" role="alert">{chefError}</p>}
                <div className="stats">
                  <div className="stat"><strong>{orderData?.stats.pending ?? 0}</strong><span>Open orders</span></div>
                  <div className="stat"><strong>{orderData?.stats.todayOrders ?? 0}</strong><span>Orders today</span></div>
                  <div className="stat"><strong>{money(orderData?.stats.todaySales ?? 0)}</strong><span>Sales today</span></div>
                </div>
                <div className="section-heading"><h2>Order queue</h2></div>
                <div className="orders-grid">
                  {orderData?.pending.length
                    ? orderData.pending.map((order) => <OrderCard key={order.id} order={order} pending onDeliver={(id, button) => void markDelivered(id, button)} />)
                    : <div className="empty">No open orders. New orders will appear here.</div>}
                </div>
                <div className="section-heading"><h2>Recently delivered</h2></div>
                <div className="orders-grid history">
                  {orderData?.delivered.length
                    ? orderData.delivered.map((order) => <OrderCard key={order.id} order={order} pending={false} onDeliver={() => {}} />)
                    : <div className="empty">Delivered orders from today will appear here.</div>}
                </div>
                <div className="section-heading"><h2>Menu management</h2></div>
                <div className="management">
                  <div className="panel-card">
                    <h3>Add a dish</h3>
                    <form onSubmit={(event) => void addDish(event)}>
                      <input value={dishName} onChange={(event) => setDishName(event.target.value)} maxLength={80} placeholder="Dish name" required />
                      <input value={dishDescription} onChange={(event) => setDishDescription(event.target.value)} maxLength={250} placeholder="Short description (optional)" />
                      <div className="form-row">
                        <select value={dishCategory} onChange={(event) => setDishCategory(event.target.value)} required aria-label="Category">
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                        <input value={dishPrice} onChange={(event) => setDishPrice(event.target.value)} type="number" min="0.01" max="1000000" step="0.01" placeholder="Price (₹)" required />
                      </div>
                      <p className="form-message" role="status">{dishMessage}</p>
                      <button className="primary" type="submit">Add dish</button>
                    </form>
                  </div>
                  <div className="panel-card">
                    <h3>Add a category</h3>
                    <form onSubmit={(event) => void addCategory(event)}>
                      <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={50} placeholder="e.g. Desserts" required />
                      <p className="form-message" role="status">{categoryMessage}</p>
                      <button className="primary" type="submit">Add category</button>
                    </form>
                  </div>
                </div>
                <div className="section-heading dish-list-heading">
                  <h2>Current dishes</h2>
                  <span className="dish-count">{currentDishes.length} {currentDishes.length === 1 ? "dish" : "dishes"}</span>
                </div>
                <div className="panel-card dish-list">
                  {currentDishes.length === 0
                    ? <p className="muted">No dishes yet. Add one above.</p>
                    : currentDishes.map((dish) => (
                      <div className="dish-row" key={dish.id}>
                        <div><strong>{dish.name}</strong><small>{dish.categoryName} · {money(dish.price)}</small></div>
                        <div className="dish-actions">
                          <span className={dish.available ? "badge" : "badge off"}>{dish.available ? "Available" : "Hidden"}</span>
                          <button className="secondary" type="button" disabled={dishActionId === dish.id} onClick={() => void toggleDish(dish)}>
                            {dishActionId === dish.id ? "Saving…" : dish.available ? "Hide" : "Show"}
                          </button>
                          <button className="delete-btn" type="button" disabled={dishActionId === dish.id} aria-label={`Delete ${dish.name}`} onClick={() => void removeDish(dish)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
