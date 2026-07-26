import tls from 'node:tls';

function probeCertificate(hostname, port = 443, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return resolve(null);
      const expiresAt = new Date(cert.valid_to);
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000);
      resolve({ expiresAt: expiresAt.toISOString(), daysLeft, issuer: cert.issuer?.O || '' });
    });
    socket.setTimeout(timeoutMs, () => { socket.destroy(); resolve(null); });
    socket.once('error', () => resolve(null));
  });
}

async function probeUrl(url, timeoutMs = 8000) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { accept: '*/*', 'user-agent': 'YedigulPano/1.0 (saglik-kontrolu)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { url, ok: response.ok, status: response.status, ms: Date.now() - startedAt };
  } catch (error) {
    return { url, ok: false, status: 0, ms: Date.now() - startedAt, error: String(error?.message || error).slice(0, 160) };
  }
}

/**
 * Site sağlığı. Dış servis, anahtar veya hesap gerektirmez — Faz 1'de
 * çalışan ikinci kaynak budur.
 */
export const health = {
  id: 'health',
  label: 'Site sağlığı',
  ttlMs: 60 * 1000,

  async load({ config }) {
    const site = new URL(config.publicSiteUrl);
    const apiUrl = new URL('/api/health', site.origin).toString();

    const [siteProbe, apiProbe, cert] = await Promise.all([
      probeUrl(config.publicSiteUrl),
      probeUrl(apiUrl),
      site.protocol === 'https:' ? probeCertificate(site.hostname) : Promise.resolve(null),
    ]);

    return {
      checkedAt: new Date().toISOString(),
      site: siteProbe,
      api: apiProbe,
      certificate: cert,
      allOk: siteProbe.ok && apiProbe.ok,
    };
  },
};
