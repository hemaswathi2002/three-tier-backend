const db = require('../config/db');

async function getWishlist(req, res, next) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT w.id, w.user_id, w.product_id, w.created_at,
              p.name, p.price, p.original_price, p.category, p.image_url, p.rating, p.rating_count, p.stock
       FROM wishlist_items w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );

    res.json({
      items: result.rows.map(item => ({
        ...item,
        price: Number(item.price),
        original_price: item.original_price ? Number(item.original_price) : null
      })),
      count: result.rows.length
    });
  } catch (err) {
    next(err);
  }
}

async function addToWishlist(req, res, next) {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required.' });
    }

    const prodRes = await db.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await db.query(
      `INSERT INTO wishlist_items (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [userId, productId]
    );

    return getWishlist(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function removeFromWishlist(req, res, next) {
  try {
    const userId = req.user.id;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    await db.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    return getWishlist(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function moveToCart(req, res, next) {
  try {
    const userId = req.user.id;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Add to cart
    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + 1, updated_at = NOW()`,
      [userId, productId, 1]
    );

    // Remove from wishlist
    await db.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);

    return getWishlist(req, res, next);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart
};
