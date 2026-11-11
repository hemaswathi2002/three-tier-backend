const express = require('express'), cors = require('cors');
const { pool, initDb, auth, h } = require('./common');

const app = express();
app.use(cors(), express.json());

const list = async (uid) =>
  (await pool.query(
    'SELECT product_id, name, price, image_url, emoji FROM wishlist_items WHERE user_id=$1 ORDER BY added_at DESC',
    [uid]
  )).rows.map((r) => ({ ...r, price: Number(r.price) }));

app.get('/health', (_, r) => r.json({ ok: true }));

app.get('/api/wishlist', auth, h(async (req, res) => res.json(await list(req.user.id))));

app.post('/api/wishlist', auth, h(async (req, res) => {
  const { productId, name, price, image_url = '', emoji = '🛍️' } = req.body;
  await pool.query(
    `INSERT INTO wishlist_items(user_id, product_id, name, price, image_url, emoji)
     VALUES($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [req.user.id, productId, name, price, image_url, emoji]
  );
  res.status(201).json(await list(req.user.id));
}));

app.delete('/api/wishlist/:productId', auth, h(async (req, res) => {
  await pool.query('DELETE FROM wishlist_items WHERE user_id=$1 AND product_id=$2', [req.user.id, req.params.productId]);
  res.json(await list(req.user.id));
}));

initDb(`
  CREATE TABLE IF NOT EXISTS wishlist_items(
    user_id INT,
    product_id INT,
    name TEXT,
    price NUMERIC(10,2),
    image_url TEXT,
    emoji TEXT,
    added_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY(user_id, product_id)
  );
  ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS image_url TEXT;
`).then(() => app.listen(3004, () => console.log('wishlist-service :3004 (with image support)')));
