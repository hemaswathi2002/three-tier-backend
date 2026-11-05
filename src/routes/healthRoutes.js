const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', async (req, res) => {
  const dbHealth = await db.checkHealth();
  const uptimeSeconds = Math.floor(process.uptime());

  const statusCode = dbHealth.connected ? 200 : 503;

  res.status(statusCode).json({
    status: dbHealth.connected ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptime: `${uptimeSeconds}s`,
    environment: process.env.NODE_ENV || 'development',
    server: {
      nodeVersion: process.version,
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    database: dbHealth
  });
});

module.exports = router;
