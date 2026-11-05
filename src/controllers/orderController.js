const db = require('../config/db');

async function createOrder(req, res, next) {
  try {
    const userId = req.user.id;
    const { shipping_name, shipping_address, shipping_city, shipping_postal, payment_method = 'Credit Card' } = req.body;

    if (!shipping_name || !shipping_address || !shipping_city || !shipping_postal) {
      return res.status(400).json({ error: 'Complete shipping information (name, address, city, postal code) is required.' });
    }

    // Get cart items
    const cartRes = await db.query(
      `SELECT c.product_id, c.quantity, p.name, p.price, p.image_url, p.stock
       FROM cart_items c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1`,
      [userId]
    );

    if (cartRes.rows.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty. Add products before checking out.' });
    }

    const items = cartRes.rows;
    const subtotal = Number(items.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0).toFixed(2));
    const tax = Number((subtotal * 0.08).toFixed(2));
    const shipping_fee = subtotal > 100 ? 0.00 : 9.99;
    const total_amount = Number((subtotal + tax + shipping_fee).toFixed(2));

    // Create Order
    const orderRes = await db.query(
      `INSERT INTO orders (user_id, subtotal, tax, shipping_fee, total_amount, shipping_name, shipping_address, shipping_city, shipping_postal, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, subtotal, tax, shipping_fee, total_amount, shipping_name, shipping_address, shipping_city, shipping_postal, payment_method]
    );

    const order = orderRes.rows[0];

    // Insert Order Items
    const insertedItems = [];
    for (const item of items) {
      const itemRes = await db.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, image_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [order.id, item.product_id, item.name, item.price, item.quantity, item.image_url]
      );
      insertedItems.push(itemRes.rows[0]);
    }

    // Clear cart
    await db.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    res.status(201).json({
      message: 'Order placed successfully',
      order: {
        ...order,
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        shipping_fee: Number(order.shipping_fee),
        total_amount: Number(order.total_amount),
        items: insertedItems
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getUserOrders(req, res, next) {
  try {
    const userId = req.user.id;

    const ordersRes = await db.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const orders = [];
    for (const order of ordersRes.rows) {
      const itemsRes = await db.query(
        `SELECT * FROM order_items WHERE order_id = $1`,
        [order.id]
      );

      orders.push({
        ...order,
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        shipping_fee: Number(order.shipping_fee),
        total_amount: Number(order.total_amount),
        items: itemsRes.rows.map(it => ({
          ...it,
          price: Number(it.price)
        }))
      });
    }

    res.json({ orders, count: orders.length });
  } catch (err) {
    next(err);
  }
}

async function getOrderById(req, res, next) {
  try {
    const userId = req.user.id;
    const orderId = parseInt(req.params.id, 10);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const orderRes = await db.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];
    const itemsRes = await db.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [order.id]
    );

    res.json({
      order: {
        ...order,
        subtotal: Number(order.subtotal),
        tax: Number(order.tax),
        shipping_fee: Number(order.shipping_fee),
        total_amount: Number(order.total_amount),
        items: itemsRes.rows.map(it => ({
          ...it,
          price: Number(it.price)
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById
};
