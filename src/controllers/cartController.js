const db = require('../config/db');

async function getCart(req, res, next) {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT c.id, c.user_id, c.product_id, c.quantity, c.created_at, c.updated_at,
              p.name, p.price, p.original_price, p.category, p.image_url, p.stock
       FROM cart_items c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.created_at ASC`,
      [userId]
    );

    const items = result.rows.map(item => ({
      ...item,
      price: Number(item.price),
      total_price: Number((Number(item.price) * item.quantity).toFixed(2))
    }));

    const subtotal = Number(items.reduce((sum, item) => sum + item.total_price, 0).toFixed(2));
    const tax = Number((subtotal * 0.08).toFixed(2)); // 8% standard tax
    const shipping = subtotal > 100 || subtotal === 0 ? 0.00 : 9.99; // Free shipping over $100
    const total = Number((subtotal + tax + shipping).toFixed(2));

    res.json({
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      summary: {
        subtotal,
        tax,
        shipping,
        total
      }
    });
  } catch (err) {
    next(err);
  }
}

async function addToCart(req, res, next) {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive integer.' });
    }

    // Verify product exists and check stock
    const prodRes = await db.query('SELECT id, name, price, stock FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await db.query(
      `INSERT INTO cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = NOW()
       RETURNING *`,
      [userId, productId, qty]
    );

    // Return updated cart
    return getCart(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function updateCartItem(req, res, next) {
  try {
    const userId = req.user.id;
    const productId = parseInt(req.params.productId, 10);
    const { quantity } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty)) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    if (qty <= 0) {
      // Remove item if quantity set to 0 or less
      await db.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    } else {
      await db.query(
        'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE user_id = $2 AND product_id = $3',
        [qty, userId, productId]
      );
    }

    return getCart(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function removeFromCart(req, res, next) {
  try {
    const userId = req.user.id;
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    await db.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    return getCart(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function clearCart(req, res, next) {
  try {
    const userId = req.user.id;
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    res.json({ message: 'Cart cleared successfully', items: [], summary: { subtotal: 0, tax: 0, shipping: 0, total: 0 } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};
