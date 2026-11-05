const assert = require('assert');
const http = require('http');
const app = require('../src/app');

// Test runner helper
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n====================================================');
  console.log('🧪 Starting E-Commerce Backend Integration Tests...');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[Test Server] Listening on internal port ${port}`);

  let authToken = null;
  let testUserId = null;
  let createdOrderId = null;

  try {
    // 1. Health check
    console.log('▶ Test 1: GET /health');
    const healthRes = await makeRequest(server, { path: '/health' });
    assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
    assert.strictEqual(healthRes.body.status, 'OK');
    console.log('  ✔ Health check passed');

    // 2. Products List
    console.log('▶ Test 2: GET /api/products');
    const prodRes = await makeRequest(server, { path: '/api/products' });
    assert.strictEqual(prodRes.status, 200);
    assert.ok(Array.isArray(prodRes.body.products), 'Should return products array');
    assert.ok(prodRes.body.products.length > 0, 'Products count should be > 0');
    console.log(`  ✔ Returned ${prodRes.body.products.length} products`);

    // 3. Categories
    console.log('▶ Test 3: GET /api/products/categories');
    const catRes = await makeRequest(server, { path: '/api/products/categories' });
    assert.strictEqual(catRes.status, 200);
    assert.ok(Array.isArray(catRes.body.categories));
    console.log(`  ✔ Returned categories: ${catRes.body.categories.map(c => c.category).join(', ')}`);

    // 4. Product details by ID
    console.log('▶ Test 4: GET /api/products/1');
    const prodDetailRes = await makeRequest(server, { path: '/api/products/1' });
    assert.strictEqual(prodDetailRes.status, 200);
    assert.strictEqual(prodDetailRes.body.product.id, 1);
    console.log(`  ✔ Fetched product: "${prodDetailRes.body.product.name}"`);

    // 5. User Registration
    console.log('▶ Test 5: POST /api/auth/register');
    const testEmail = `testuser_${Date.now()}@example.com`;
    const regRes = await makeRequest(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      name: 'Alex Johnson',
      email: testEmail,
      password: 'SecurePassword123!',
      city: 'Seattle',
      postal_code: '98101'
    });
    assert.strictEqual(regRes.status, 201);
    assert.ok(regRes.body.token, 'Should return JWT token');
    assert.strictEqual(regRes.body.user.email, testEmail);
    authToken = regRes.body.token;
    testUserId = regRes.body.user.id;
    console.log(`  ✔ User registered successfully with id ${testUserId}`);

    // 6. User Login
    console.log('▶ Test 6: POST /api/auth/login');
    const loginRes = await makeRequest(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      email: testEmail,
      password: 'SecurePassword123!'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginRes.body.token);
    console.log('  ✔ User login succeeded and issued valid token');

    // 7. Get Current User Profile
    console.log('▶ Test 7: GET /api/auth/me');
    const meRes = await makeRequest(server, {
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, testEmail);
    console.log('  ✔ Current user profile retrieved');

    // 8. Add Product to Cart
    console.log('▶ Test 8: POST /api/cart (Add product ID 1)');
    const addCartRes = await makeRequest(server, {
      path: '/api/cart',
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    }, { productId: 1, quantity: 2 });
    assert.strictEqual(addCartRes.status, 200);
    assert.strictEqual(addCartRes.body.items.length, 1);
    assert.strictEqual(addCartRes.body.items[0].quantity, 2);
    console.log(`  ✔ Cart now has ${addCartRes.body.itemCount} items, Subtotal: $${addCartRes.body.summary.subtotal}`);

    // 9. Update Cart Item Quantity
    console.log('▶ Test 9: PUT /api/cart/1 (Update quantity to 3)');
    const updateCartRes = await makeRequest(server, {
      path: '/api/cart/1',
      method: 'PUT',
      headers: { Authorization: `Bearer ${authToken}` }
    }, { quantity: 3 });
    assert.strictEqual(updateCartRes.status, 200);
    assert.strictEqual(updateCartRes.body.items[0].quantity, 3);
    console.log('  ✔ Cart item quantity updated to 3');

    // 10. Wishlist management
    console.log('▶ Test 10: POST /api/wishlist (Add product ID 2)');
    const addWishRes = await makeRequest(server, {
      path: '/api/wishlist',
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    }, { productId: 2 });
    assert.strictEqual(addWishRes.status, 200);
    assert.strictEqual(addWishRes.body.items.length, 1);
    console.log('  ✔ Product added to wishlist');

    console.log('▶ Test 11: POST /api/wishlist/2/move-to-cart');
    const moveRes = await makeRequest(server, {
      path: '/api/wishlist/2/move-to-cart',
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.strictEqual(moveRes.status, 200);
    assert.strictEqual(moveRes.body.items.length, 0, 'Wishlist should now be empty');
    console.log('  ✔ Product successfully moved from wishlist to cart');

    // 12. Checkout / Place Order
    console.log('▶ Test 12: POST /api/orders (Place order)');
    const orderRes = await makeRequest(server, {
      path: '/api/orders',
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    }, {
      shipping_name: 'Alex Johnson',
      shipping_address: '1000 2nd Avenue, Suite 400',
      shipping_city: 'Seattle',
      shipping_postal: '98104',
      payment_method: 'Credit Card'
    });
    assert.strictEqual(orderRes.status, 201);
    assert.ok(orderRes.body.order.id);
    assert.strictEqual(orderRes.body.order.items.length, 2);
    assert.ok(orderRes.body.order.total_amount > 0);
    createdOrderId = orderRes.body.order.id;
    console.log(`  ✔ Order #${createdOrderId} created! Total: $${orderRes.body.order.total_amount}`);

    // 13. Verify cart was cleared after order placement
    console.log('▶ Test 13: GET /api/cart (Verify cart cleared)');
    const emptyCartRes = await makeRequest(server, {
      path: '/api/cart',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.strictEqual(emptyCartRes.status, 200);
    assert.strictEqual(emptyCartRes.body.items.length, 0);
    console.log('  ✔ Verified cart is cleared after checkout');

    // 14. Get User Orders
    console.log('▶ Test 14: GET /api/orders');
    const ordersListRes = await makeRequest(server, {
      path: '/api/orders',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.strictEqual(ordersListRes.status, 200);
    assert.strictEqual(ordersListRes.body.orders.length, 1);
    console.log(`  ✔ Found ${ordersListRes.body.orders.length} order in user history`);

    console.log('\n====================================================');
    console.log('🎉 ALL 14 BACKEND TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
