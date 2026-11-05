module.exports = {
  apps: [
    {
      name: 'ecommerce-backend',
      script: './src/server.js',
      instances: 'max', // Utilizes all available EC2 CPU vCPUs
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '/var/log/ecommerce-backend/err.log',
      out_file: '/var/log/ecommerce-backend/out.log',
      merge_logs: true,
      time: true
    }
  ]
};
