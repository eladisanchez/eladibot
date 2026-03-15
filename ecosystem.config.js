module.exports = {
  apps: [
    {
      name: "eladi-bot",
      script: "./bot.js",
      watch: ["bot.js", "src"],
      ignore_watch: ["node_modules", "*.log", ".git"],
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
