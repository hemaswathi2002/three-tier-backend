const express = require('express'), cors = require('cors');
const { pool, initDb, auth, h } = require('./common');

const app = express();
app.use(cors(), express.json());

const list = async (uid) =>
  (await pool.query(
    'SELECT product_id, name, price, image_url, emoji, qty FROM cart_items WHERE user_id=$1 ORDER BY added_at',
    [uid]
  )).rows.map((r) => ({ ...r, price: Number(r.price) }));

app.get('/health', (_, r) => r.json({ ok: true }));

app.get('/api/cart', auth, h(async (req, res) => res.json(await list(req.user.id))));

app.post('/api/cart', auth, h(async (req, res) => {
  const { productId, name, price, image_url = '', emoji = '🛍️', qty = 1 } = req.body;
  await pool.query(
    `INSERT INTO cart_items(user_id, product_id, name, price, image_url, emoji, qty)
     VALUES($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty, image_url = COALESCE(EXCLUDED.image_url, cart_items.image_url)`,
    [req.user.id, productId, name, price, image_url, emoji, qty]
  );
  res.status(201).json(await list(req.user.id));
}));

app.put('/api/cart/:productId', auth, h(async (req, res) => {
  const qty = parseInt(req.body.qty, 10);
  if (qty < 1) {
    await pool.query('DELETE FROM cart_items WHERE user_id=$1 AND product_id=$2', [req.user.id, req.params.productId]);
  } else {
    await pool.query('UPDATE cart_items SET qty=$3 WHERE user_id=$1 AND product_id=$2', [req.user.id, req.params.productId, qty]);
  }
  res.json(await list(req.user.id));
}));

app.delete('/api/cart/:productId', auth, h(async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id=$1 AND product_id=$2', [req.user.id, req.params.productId]);
  res.json(await list(req.user.id));
}));

app.delete('/api/cart', auth, h(async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id=$1', [req.user.id]);
  res.json([]);
}));

initDb(`
  CREATE TABLE IF NOT EXISTS cart_items(
    user_id INT,
    product_id INT,
    name TEXT,
    price NUMERIC(10,2),
    image_url TEXT,
    emoji TEXT,
    qty INT DEFAULT 1,
    added_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY(user_id, product_id)
  );
  ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS image_url TEXT;
`).then(() => app.listen(3003, () => console.log('cart-service :3003 (with image support)')));
