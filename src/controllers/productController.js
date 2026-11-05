const db = require('../config/db');

async function getAllProducts(req, res, next) {
  try {
    const { category, search, sort, featured, minPrice, maxPrice } = req.query;

    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (category && category !== 'All') {
      sql += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (search && search.trim() !== '') {
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (featured === 'true') {
      sql += ' AND featured = true';
    }

    if (minPrice) {
      sql += ` AND price >= $${paramIndex++}`;
      params.push(Number(minPrice));
    }

    if (maxPrice) {
      sql += ` AND price <= $${paramIndex++}`;
      params.push(Number(maxPrice));
    }

    if (sort === 'price_asc') {
      sql += ' ORDER BY price ASC';
    } else if (sort === 'price_desc') {
      sql += ' ORDER BY price DESC';
    } else if (sort === 'rating') {
      sql += ' ORDER BY rating DESC';
    } else {
      sql += ' ORDER BY id ASC';
    }

    const result = await db.query(sql, params);
    res.json({
      count: result.rows.length,
      products: result.rows
    });
  } catch (err) {
    next(err);
  }
}

async function getProductById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function getCategories(req, res, next) {
  try {
    const result = await db.query(
      'SELECT DISTINCT category, COUNT(*) as count FROM products GROUP BY category ORDER BY category ASC'
    );
    res.json({ categories: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllProducts,
  getProductById,
  getCategories
};
