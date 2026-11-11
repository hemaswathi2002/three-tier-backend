const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error('DATABASE_URL and JWT_SECRET must be set');
  process.exit(1);
}

// AWS RDS PostgreSQL SSL support
const ssl = process.env.DB_SSL === 'true' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('rds.amazonaws.com'))
  ? { rejectUnauthorized: false }
  : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: 10
});

pool.on('error', (e) => console.error('pg pool error:', e.message));

// Close DB connections and exit cleanly
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => pool.end().finally(() => process.exit(0)));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function initDb(sql) {
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query(sql);
      return;
    } catch (e) {
      console.log('waiting for db...', e.message);
      await wait(2000);
    }
  }
  throw new Error('database unavailable');
}

const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in first' });
  }
};

const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Server error' });
});

module.exports = { pool, initDb, auth, h, jwt };
