# PM2-конфиг для продакшена. Использование: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'flowpilot',
      cwd: '/var/www/flowpilot',
      script: 'node_modules/.bin/tsx',
      args: 'server/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 8787
      },
      autorestart: true,
      max_memory_restart: '512M',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log'
    }
  ]
};
