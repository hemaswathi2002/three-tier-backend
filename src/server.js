const app = require('./app');
const { setupDatabase } = require('./config/db');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Attempt schema initialization if PostgreSQL is available
    await setupDatabase();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('====================================================');
      console.log(`🚀 E-Commerce Backend Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🩺 Health check: http://0.0.0.0:${PORT}/health`);
      console.log(`🛍️ Products API: http://0.0.0.0:${PORT}/api/products`);
      console.log('====================================================');
    });

    // Graceful shutdown handling for EC2 / PM2
    const shutdown = (signal) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  }
}

startServer();
