import 'dotenv/config';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { TunnelManager } from './tunnel.js';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const config = loadConfig();
const tunnel = new TunnelManager(config);
const app = createApp({ config, tunnel, distDir: join(rootDir, 'dist') });

const server = app.listen(config.localPort, config.localHost, () => {
  console.log(`Yedigül Lokal Yönetim: http://${config.localHost}:${config.localPort}`);
  console.log(`Bağlantı modu: ${config.sshEnabled ? 'SSH tüneli' : 'lokal geliştirme'}`);
});

async function shutdown() {
  await tunnel.stop();
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

