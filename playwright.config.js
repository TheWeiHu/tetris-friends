import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:45000,fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:55031',headless:true,viewport:{width:1440,height:1000},trace:'retain-on-failure'},
  webServer:{command:'PORT=55031 node server/index.js',url:'http://127.0.0.1:55031/health',reuseExistingServer:!process.env.CI,gracefulShutdown:{signal:'SIGTERM',timeout:3000}},
});
