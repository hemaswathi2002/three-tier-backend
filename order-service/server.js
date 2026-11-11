const express = require('express'), cors = require('cors');
const { pool, initDb, auth, h } = require('./common');

const app = express();
app.use(cors(), express.json());
const CART = process.env.CART_SERVICE_URL || 'http://cart-service:3003';

app.get('/health', (_, r) => r.json({ ok: true }));

app.get('/api/orders', auth, h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.total, o.created_at,
     json_agg(json_build_object(
       'name', i.name,
       'price', i.price,
       'qty', i.qty,
       'image_url', i.image_url,
       'emoji', i.emoji
     )) AS items
     FROM orders o
     JOIN order_items i ON i.order_id=o.id
     WHERE o.user_id=$1
     GROUP BY o.id
     ORDER BY o.id DESC`,
    [req.user.id]
  );
  res.json(rows.map((o) => ({ ...o, total: Number(o.total) })));
}));

// Checkout: reads user's cart from cart-service, stores order with images, then empties cart.
app.post('/api/orders', auth, h(async (req, res) => {
  const headers = { Authorization: req.headers.authorization };
  const items = await (await fetch(`${CART}/api/cart`, { headers })).json();
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Your cart is empty' });
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO orders(user_id, total) VALUES($1, $2) RETURNING id', [req.user.id, total]);
    const orderId = rows[0].id;

    for (const i of items) {
      await client.query(
        `INSERT INTO order_items(order_id, product_id, name, price, qty, image_url, emoji)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, i.product_id, i.name, i.price, i.qty, i.image_url || '', i.emoji || '🛍️']
      );
    }

    await client.query('COMMIT');
    await fetch(`${CART}/api/cart`, { method: 'DELETE', headers });
    res.status(201).json({ id: orderId, total });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

initDb(`
  CREATE TABLE IF NOT EXISTS orders(
    id SERIAL PRIMARY KEY,
    user_id INT,
    total NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS order_items(
    order_id INT REFERENCES orders(id),
    product_id INT,
    name TEXT,
    price NUMERIC(10,2),
    qty INT,
    image_url TEXT,
    emoji TEXT
  );
  ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT;
`).then(() => app.listen(3005, () => console.log('order-service :3005 (with image support)')));
