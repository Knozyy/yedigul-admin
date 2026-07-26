import 'dotenv/config';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { PanoCache } from './cache.js';
import { loadConfig } from './config.js';
import { TunnelManager } from './tunnel.js';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const config = loadConfig();
const tunnel = new TunnelManager(config);
const cache = new PanoCache(config.dbPath);
const app = createApp({ config, tunnel, cache, distDir: join(rootDir, 'dist') });
const panelUrl = `http://${config.localHost}:${config.localPort}/`;

function openInBrowser(url) {
  const child = process.platform === 'win32'
    ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });

  child.on('error', (error) => {
    console.warn(`Tarayıcı açılamadı, adresi elle açın: ${url} (${error.message})`);
  });
  child.unref();
}

const server = app.listen(config.localPort, config.localHost, () => {
  console.log(`Yedigül Lokal Yönetim: ${panelUrl}`);
  console.log(`Bağlantı modu: ${config.sshEnabled ? 'SSH tüneli' : 'lokal geliştirme'}`);
  if (process.env.OPEN_BROWSER === '1') {
    openInBrowser(panelUrl);
  }
});

async function shutdown() {
  await tunnel.stop();
  cache.close();
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

