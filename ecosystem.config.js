module.exports = {
  apps: [
    {
      name: 'heinstitutes-app',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3019,
      },
      // .env is still loaded by dotenv inside server.js for MONGODB_URI etc -
      // PORT here just makes it explicit/visible in `pm2 show heinstitutes-app`
      max_memory_restart: '300M',
      autorestart: true,
      watch: false,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      time: true,
    },
  ],
};
