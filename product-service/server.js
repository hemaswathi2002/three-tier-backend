const express = require('express'), cors = require('cors');
const { pool, initDb, h } = require('./common');

const app = express();
app.use(cors(), express.json());

const seed = [
  ['Ceramic pour-over set', 'Dripper, carafe and two cups.', 48, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80', 'Kitchen', '☕'],
  ['Linen throw blanket', 'Stonewashed, 130 x 170 cm.', 62, 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=600&q=80', 'Home', '🛋️'],
  ['Trail running shoes', 'Lightweight, grippy outsole.', 95, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80', 'Sport', '👟'],
  ['Canvas daypack', '18 L, water-resistant.', 54, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80', 'Travel', '🎒'],
  ['Desk plant: monstera', 'Potted, 30 cm.', 28, 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600&q=80', 'Home', '🪴'],
  ['Mechanical keyboard', 'Hot-swappable, tactile switches.', 120, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&q=80', 'Tech', '⌨️'],
  ['Noise-cancelling headphones', '30-hour battery.', 180, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80', 'Tech', '🎧'],
  ['Insulated steel bottle', '750 ml, keeps cold 24 h.', 26, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&q=80', 'Sport', '🍶'],
];

app.get('/health', (_, r) => r.json({ ok: true }));

// List products with optional search query
app.get('/api/products', h(async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const { rows } = await pool.query(
    'SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1 ORDER BY id',
    [q]
  );
  res.json(rows.map((p) => ({ ...p, price: Number(p.price) })));
}));

// Get single product by ID
app.get('/api/products/:id', h(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
  rows[0] ? res.json({ ...rows[0], price: Number(rows[0].price) }) : res.status(404).json({ error: 'Product not found' });
}));

// Create a new product (reflects immediately on DB)
app.post('/api/products', h(async (req, res) => {
  const { name, description = '', price, image_url = '', category = 'General', emoji = '🛍️' } = req.body;
  if (!name || price === undefined || isNaN(Number(price))) {
    return res.status(400).json({ error: 'Valid product name and price are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO products(name, description, price, image_url, category, emoji)
     VALUES($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name.trim(), description.trim(), Number(price), image_url.trim(), category.trim(), emoji.trim()]
  );

  res.status(201).json({ ...rows[0], price: Number(rows[0].price) });
}));

// Update an existing product
app.put('/api/products/:id', h(async (req, res) => {
  const { name, description, price, image_url, category, emoji } = req.body;
  const { rows } = await pool.query(
    `UPDATE products
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         image_url = COALESCE($4, image_url),
         category = COALESCE($5, category),
         emoji = COALESCE($6, emoji)
     WHERE id = $7
     RETURNING *`,
    [name, description, price !== undefined ? Number(price) : null, image_url, category, emoji, req.params.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Product not found' });
  res.json({ ...rows[0], price: Number(rows[0].price) });
}));

// Delete a product
app.delete('/api/products/:id', h(async (req, res) => {
  await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

(async () => {
  // Ensure table and image_url column exist
  await initDb(`
    CREATE TABLE IF NOT EXISTS products(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price NUMERIC(10,2) NOT NULL,
      image_url TEXT,
      emoji TEXT,
      category TEXT
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);

  // Seed default products if table is empty
  const countRes = await pool.query('SELECT COUNT(*) FROM products');
  if (parseInt(countRes.rows[0].count, 10) === 0) {
    for (const p of seed) {
      await pool.query(
        'INSERT INTO products(name, description, price, image_url, category, emoji) VALUES($1, $2, $3, $4, $5, $6)',
        p
      );
    }
  } else {
    // If existing products lack image_url, populate them from seed
    for (const p of seed) {
      await pool.query(
        'UPDATE products SET image_url=$1, emoji=$2 WHERE name=$3 AND (image_url IS NULL OR image_url=\'\')',
        [p[3], p[5], p[0]]
      );
    }
  }

  app.listen(3002, () => console.log('product-service :3002 (with image & DB sync support)'));
})();
