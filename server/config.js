import { resolve } from 'node:path';

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isLoopback(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

export function loadConfig(env = process.env) {
  const localHost = env.LOCAL_HOST || '127.0.0.1';
  if (!isLoopback(localHost)) {
    throw new Error('LOCAL_HOST yalnızca loopback adresi olabilir (127.0.0.1).');
  }

  const remoteAdminBaseUrl = new URL(env.REMOTE_ADMIN_BASE_URL || 'http://127.0.0.1:43002');
  if (!isLoopback(remoteAdminBaseUrl.hostname)) {
    throw new Error('REMOTE_ADMIN_BASE_URL güvenlik gereği yalnızca loopback adresi olabilir.');
  }

  const keyPath = env.SSH_KEY_PATH ? resolve(env.SSH_KEY_PATH) : '';
  const knownHostsPath = env.SSH_KNOWN_HOSTS_PATH ? resolve(env.SSH_KNOWN_HOSTS_PATH) : '';

  return Object.freeze({
    localHost,
    localPort: integer(env.LOCAL_PORT, 4310),
    sshEnabled: env.SSH_ENABLED !== '0',
    sshHost: String(env.SSH_HOST || '').trim(),
    sshPort: integer(env.SSH_PORT, 22),
    sshUser: String(env.SSH_USER || '').trim(),
    sshKeyPath: keyPath,
    sshKnownHostsPath: knownHostsPath,
    localTunnelPort: integer(env.LOCAL_TUNNEL_PORT, 43002),
    remoteAdminHost: String(env.REMOTE_ADMIN_HOST || '127.0.0.1').trim(),
    remoteAdminPort: integer(env.REMOTE_ADMIN_PORT, 3002),
    remoteAdminBaseUrl: remoteAdminBaseUrl.toString().replace(/\/$/, ''),
    remoteAuthPath: String(env.REMOTE_AUTH_PATH || '/api/auth').replace(/\/$/, ''),
    remoteAdminPath: String(env.REMOTE_ADMIN_PATH || '/api/admin').replace(/\/$/, ''),
    publicMenuUrl: String(env.PUBLIC_MENU_URL || 'https://www.yedigulrestorant.com/menu/'),
    sessionTtlMs: 8 * 60 * 60 * 1000,
    maxProxyBodyBytes: 8 * 1024 * 1024,
  });
}

