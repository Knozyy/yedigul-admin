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

    // ---- Pano ----
    // Site sağlığı konektörü bu adresi ve aynı köken altındaki /api/health'i yoklar.
    publicSiteUrl: String(env.PUBLIC_SITE_URL || 'https://www.yedigulrestorant.com/'),
    // Konektör önbelleği ve günlük anlık görüntüler. Boşsa bellek içi çalışır.
    dbPath: env.PANO_DB_PATH ? resolve(env.PANO_DB_PATH) : '',
    // Boş kalırsa ilgili panel "bağlı değil" durumunda görünür, pano çalışır.
    instagram: Object.freeze({
      userId: String(env.IG_USER_ID || '').trim(),
      accessToken: String(env.IG_ACCESS_TOKEN || '').trim(),
    }),
    ga4: Object.freeze({
      propertyId: String(env.GA4_PROPERTY_ID || '').trim(),
      credentialsPath: env.GA4_CREDENTIALS_PATH ? resolve(env.GA4_CREDENTIALS_PATH) : '',
    }),
    places: Object.freeze({
      apiKey: String(env.PLACES_API_KEY || '').trim(),
      placeId: String(env.PLACES_PLACE_ID || '').trim(),
    }),
  });
}

