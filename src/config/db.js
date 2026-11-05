const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { seedProducts } = require('../seed/seedData');

let pool = null;
let isMock = false;

// In-Memory Database store for standalone testing / offline development
class InMemoryDatabase {
  constructor() {
    this.users = [];
    this.products = [];
    this.cart_items = [];
    this.wishlist_items = [];
    this.orders = [];
    this.order_items = [];
    this.userIdCounter = 1;
    this.productIdCounter = 1;
    this.cartIdCounter = 1;
    this.wishlistIdCounter = 1;
    this.orderIdCounter = 1;
    this.orderItemIdCounter = 1;

    // Seed products
    for (const p of seedProducts) {
      this.products.push({
        id: this.productIdCounter++,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        original_price: p.original_price ? Number(p.original_price) : null,
        category: p.category,
        image_url: p.image_url,
        rating: Number(p.rating),
        rating_count: Number(p.rating_count),
        stock: Number(p.stock),
        featured: Boolean(p.featured),
        created_at: new Date()
      });
    }
  }

  async query(text, params = []) {
    const sql = text.trim();

    // 1. SELECT products
    if (sql.startsWith('SELECT') && sql.includes('FROM products')) {
      if (sql.includes('WHERE id = $1')) {
        const id = Number(params[0]);
        const product = this.products.find(p => p.id === id);
        return { rows: product ? [product] : [] };
      }
      
      if (sql.includes('DISTINCT category')) {
        const counts = {};
        for (const p of this.products) {
          counts[p.category] = (counts[p.category] || 0) + 1;
        }
        const rows = Object.keys(counts).map(category => ({
          category,
          count: counts[category]
        }));
        return { rows };
      }

      let filtered = [...this.products];
      let pIdx = 0;

      // Category filter
      if (sql.includes('category = $')) {
        const cat = params[pIdx++];
        filtered = filtered.filter(p => p.category.toLowerCase() === cat.toLowerCase());
      }
      // Search filter
      if (sql.includes('ILIKE $')) {
        const term = params[pIdx++].replace(/%/g, '').toLowerCase();
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(term) || 
          p.description.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term)
        );
      }
      // Featured
      if (sql.includes('featured = true')) {
        filtered = filtered.filter(p => p.featured === true);
      }

      // Sort
      if (sql.includes('ORDER BY price ASC')) {
        filtered.sort((a, b) => a.price - b.price);
      } else if (sql.includes('ORDER BY price DESC')) {
        filtered.sort((a, b) => b.price - a.price);
      } else if (sql.includes('ORDER BY rating DESC')) {
        filtered.sort((a, b) => b.rating - a.rating);
      } else {
        filtered.sort((a, b) => b.id - a.id);
      }

      return { rows: filtered };
    }

    // 2. USERS
    if (sql.startsWith('SELECT') && sql.includes('FROM users')) {
      if (sql.includes('WHERE email = $1')) {
        const email = String(params[0]).toLowerCase();
        const user = this.users.find(u => u.email.toLowerCase() === email);
        return { rows: user ? [user] : [] };
      }
      if (sql.includes('WHERE id = $1')) {
        const id = Number(params[0]);
        const user = this.users.find(u => u.id === id);
        return { rows: user ? [user] : [] };
      }
    }

    if (sql.startsWith('INSERT INTO users')) {
      const name = params[0];
      const email = String(params[1]).toLowerCase();
      const password_hash = params[2];
      const phone = params[3] || null;
      const address = params[4] || null;
      const city = params[5] || null;
      const postal_code = params[6] || null;
      const role = params[7] || 'customer';

      const newUser = {
        id: this.userIdCounter++,
        name,
        email,
        password_hash,
        phone,
        address,
        city,
        postal_code,
        role,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.users.push(newUser);
      return { rows: [newUser] };
    }

    // 3. CART
    if (sql.startsWith('SELECT') && sql.includes('FROM cart_items')) {
      const userId = Number(params[0]);
      const items = this.cart_items
        .filter(c => c.user_id === userId)
        .map(c => {
          const product = this.products.find(p => p.id === c.product_id) || {};
          return {
            id: c.id,
            user_id: c.user_id,
            product_id: c.product_id,
            quantity: c.quantity,
            created_at: c.created_at,
            updated_at: c.updated_at,
            name: product.name,
            price: product.price,
            original_price: product.original_price,
            category: product.category,
            image_url: product.image_url,
            stock: product.stock
          };
        });
      return { rows: items };
    }

    if (sql.startsWith('INSERT INTO cart_items')) {
      const userId = Number(params[0]);
      const productId = Number(params[1]);
      const quantity = (params.length > 2 && params[2] !== undefined && !isNaN(Number(params[2]))) ? Number(params[2]) : 1;

      let item = this.cart_items.find(c => c.user_id === userId && c.product_id === productId);
      if (item) {
        if (sql.includes('cart_items.quantity + EXCLUDED.quantity')) {
          item.quantity += quantity;
        } else {
          item.quantity = quantity;
        }
        item.updated_at = new Date();
      } else {
        item = {
          id: this.cartIdCounter++,
          user_id: userId,
          product_id: productId,
          quantity,
          created_at: new Date(),
          updated_at: new Date()
        };
        this.cart_items.push(item);
      }
      return { rows: [item] };
    }

    if (sql.startsWith('UPDATE cart_items')) {
      const quantity = Number(params[0]);
      const userId = Number(params[1]);
      const productId = Number(params[2]);
      const item = this.cart_items.find(c => c.user_id === userId && c.product_id === productId);
      if (item) {
        item.quantity = quantity;
        item.updated_at = new Date();
        return { rows: [item], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('DELETE FROM cart_items')) {
      const userId = Number(params[0]);
      if (params.length > 1) {
        const productId = Number(params[1]);
        const before = this.cart_items.length;
        this.cart_items = this.cart_items.filter(c => !(c.user_id === userId && c.product_id === productId));
        return { rowCount: before - this.cart_items.length };
      } else {
        const before = this.cart_items.length;
        this.cart_items = this.cart_items.filter(c => c.user_id !== userId);
        return { rowCount: before - this.cart_items.length };
      }
    }

    // 4. WISHLIST
    if (sql.startsWith('SELECT') && sql.includes('FROM wishlist_items')) {
      const userId = Number(params[0]);
      const items = this.wishlist_items
        .filter(w => w.user_id === userId)
        .map(w => {
          const product = this.products.find(p => p.id === w.product_id) || {};
          return {
            id: w.id,
            user_id: w.user_id,
            product_id: w.product_id,
            created_at: w.created_at,
            name: product.name,
            price: product.price,
            original_price: product.original_price,
            category: product.category,
            image_url: product.image_url,
            rating: product.rating,
            rating_count: product.rating_count,
            stock: product.stock
          };
        });
      return { rows: items };
    }

    if (sql.startsWith('INSERT INTO wishlist_items')) {
      const userId = Number(params[0]);
      const productId = Number(params[1]);
      let item = this.wishlist_items.find(w => w.user_id === userId && w.product_id === productId);
      if (!item) {
        item = {
          id: this.wishlistIdCounter++,
          user_id: userId,
          product_id: productId,
          created_at: new Date()
        };
        this.wishlist_items.push(item);
      }
      return { rows: [item] };
    }

    if (sql.startsWith('DELETE FROM wishlist_items')) {
      const userId = Number(params[0]);
      const productId = Number(params[1]);
      const before = this.wishlist_items.length;
      this.wishlist_items = this.wishlist_items.filter(w => !(w.user_id === userId && w.product_id === productId));
      return { rowCount: before - this.wishlist_items.length };
    }

    // 5. ORDERS
    if (sql.startsWith('INSERT INTO orders')) {
      const userId = Number(params[0]);
      const subtotal = Number(params[1]);
      const tax = Number(params[2]);
      const shipping_fee = Number(params[3]);
      const total_amount = Number(params[4]);
      const shipping_name = params[5];
      const shipping_address = params[6];
      const shipping_city = params[7];
      const shipping_postal = params[8];
      const payment_method = params[9] || 'Card';

      const order = {
        id: this.orderIdCounter++,
        user_id: userId,
        subtotal,
        tax,
        shipping_fee,
        total_amount,
        status: 'Processing',
        shipping_name,
        shipping_address,
        shipping_city,
        shipping_postal,
        payment_method,
        payment_status: 'Paid',
        created_at: new Date()
      };
      this.orders.push(order);
      return { rows: [order] };
    }

    if (sql.startsWith('INSERT INTO order_items')) {
      const orderId = Number(params[0]);
      const productId = Number(params[1]);
      const productName = params[2];
      const price = Number(params[3]);
      const quantity = Number(params[4]);
      const imageUrl = params[5];

      const item = {
        id: this.orderItemIdCounter++,
        order_id: orderId,
        product_id: productId,
        product_name: productName,
        price,
        quantity,
        image_url: imageUrl,
        created_at: new Date()
      };
      this.order_items.push(item);
      return { rows: [item] };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM orders')) {
      if (sql.includes('WHERE id = $1 AND user_id = $2')) {
        const id = Number(params[0]);
        const userId = Number(params[1]);
        const order = this.orders.find(o => o.id === id && o.user_id === userId);
        return { rows: order ? [order] : [] };
      }
      if (sql.includes('WHERE user_id = $1')) {
        const userId = Number(params[0]);
        const orders = this.orders
          .filter(o => o.user_id === userId)
          .sort((a, b) => b.created_at - a.created_at);
        return { rows: orders };
      }
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM order_items')) {
      const orderId = Number(params[0]);
      const items = this.order_items.filter(oi => oi.order_id === orderId);
      return { rows: items };
    }

    // Health check or generic query
    if (sql.toUpperCase().includes('SELECT 1') || sql.toUpperCase().includes('NOW()')) {
      return { rows: [{ '?column?': 1, now: new Date() }] };
    }

    return { rows: [], rowCount: 0 };
  }
}

const inMemoryDb = new InMemoryDatabase();

function initializeDbPool() {
  const isPostgresConfigured = Boolean(
    process.env.DB_HOST && 
    process.env.DB_HOST !== 'localhost' && 
    process.env.DB_HOST !== 'your-rds-endpoint.c9xxxx.us-east-1.rds.amazonaws.com'
  );

  if (!isPostgresConfigured || process.env.USE_MOCK_DB === 'true') {
    isMock = true;
    console.log('[Database] Operating with built-in resilient database storage (active for test & standalone mode)');
    return;
  }

  try {
    const sslConfig = process.env.DB_SSL === 'true' 
      ? { rejectUnauthorized: false } 
      : false;

    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'ecommerce_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT || '5000', 10),
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL RDS Pool Error]:', err.message);
    });

    console.log(`[Database] PostgreSQL pool initialized for RDS host: ${process.env.DB_HOST}`);
  } catch (err) {
    console.warn('[Database] Could not initialize PostgreSQL pool, falling back to in-memory mode:', err.message);
    isMock = true;
  }
}

// Auto-run schema migrations and product seeding on PostgreSQL startup
async function setupDatabase() {
  if (isMock || !pool) return;

  try {
    const client = await pool.connect();
    try {
      const schemaPath = path.join(__dirname, '../models/schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
      console.log('[Database] PostgreSQL schema verified / created successfully.');

      // Check if products table is empty
      const checkRes = await client.query('SELECT COUNT(*) FROM products');
      if (parseInt(checkRes.rows[0].count, 10) === 0) {
        console.log('[Database] Seeding initial product catalog into RDS PostgreSQL...');
        for (const p of seedProducts) {
          await client.query(
            `INSERT INTO products (name, description, price, original_price, category, image_url, rating, rating_count, stock, featured)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [p.name, p.description, p.price, p.original_price, p.category, p.image_url, p.rating, p.rating_count, p.stock, p.featured]
          );
        }
        console.log(`[Database] Successfully seeded ${seedProducts.length} products.`);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Database Setup Warning]:', err.message);
  }
}

// Unified query executor
async function query(text, params) {
  if (isMock || !pool) {
    return inMemoryDb.query(text, params);
  }

  try {
    return await pool.query(text, params);
  } catch (err) {
    // If PostgreSQL fails during runtime, log and fallback
    console.error('[Database Query Error]:', err.message);
    throw err;
  }
}

// Health check function
async function checkHealth() {
  if (isMock || !pool) {
    return { status: 'healthy', provider: 'in-memory-storage', connected: true };
  }
  try {
    const res = await pool.query('SELECT 1 as alive, NOW() as current_time');
    return {
      status: 'healthy',
      provider: 'AWS RDS PostgreSQL',
      connected: true,
      timestamp: res.rows[0].current_time
    };
  } catch (err) {
    return {
      status: 'degraded',
      provider: 'AWS RDS PostgreSQL',
      connected: false,
      error: err.message
    };
  }
}

// Initialize on require
initializeDbPool();

module.exports = {
  query,
  checkHealth,
  setupDatabase,
  isMockMode: () => isMock
};
