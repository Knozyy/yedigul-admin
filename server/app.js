import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { RemoteClient } from './remote-client.js';
import { SessionStore, SESSION_COOKIE } from './session-store.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestHostname(req) {
  const raw = String(req.headers.host || '');
  if (raw.startsWith('[')) return raw.slice(0, raw.indexOf(']') + 1);
  return raw.split(':')[0];
}

function isLocalOrigin(value) {
  if (!value) return true;
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function cookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: config.sessionTtlMs,
    path: '/',
  };
}

function publicSession(session, tunnel, config) {
  return {
    csrf: session.csrf,
    authenticated: Boolean(session.remoteToken),
    tunnel: tunnel.status(),
    publicMenuUrl: config.publicMenuUrl,
  };
}

function errorStatus(error, fallback = 502) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https://www.yedigulrestorant.com; " +
      "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; " +
      "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  next();
}

export function createApp({ config, tunnel, remoteClient = new RemoteClient(config), distDir = null }) {
  const app = express();
  const sessions = new SessionStore(config.sessionTtlMs);

  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(securityHeaders);
  app.use((req, res, next) => {
    if (!LOOPBACK_HOSTS.has(requestHostname(req))) {
      return res.status(403).json({ error: 'Geçersiz Host başlığı.' });
    }
    if (!SAFE_METHODS.has(req.method) && !isLocalOrigin(req.headers.origin)) {
      return res.status(403).json({ error: 'İstek kaynağı reddedildi.' });
    }
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: '512kb', type: ['application/json', 'application/*+json'] }));

  app.use('/local-api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = sessions.getOrCreate(req.cookies?.[SESSION_COOKIE]);
    req.localSession = session;
    if (req.cookies?.[SESSION_COOKIE] !== session.id) {
      res.cookie(SESSION_COOKIE, session.id, cookieOptions(config));
    }
    next();
  });

  const csrf = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!sessions.verifyCsrf(req.localSession, req.headers['x-csrf-token'])) {
      return res.status(403).json({ error: 'Güvenlik anahtarı geçersiz. Sayfayı yenileyin.' });
    }
    next();
  };

  app.get('/local-api/bootstrap', (req, res) => {
    res.json(publicSession(req.localSession, tunnel, config));
  });

  app.post('/local-api/tunnel/connect', csrf, async (req, res) => {
    try {
      await tunnel.start();
      res.json(publicSession(req.localSession, tunnel, config));
    } catch (error) {
      res.status(errorStatus(error, 503)).json({ error: error.message, tunnel: tunnel.status() });
    }
  });

  app.post('/local-api/tunnel/disconnect', csrf, async (req, res) => {
    sessions.clearRemoteToken(req.localSession);
    await tunnel.stop();
    res.json(publicSession(req.localSession, tunnel, config));
  });

  app.post('/local-api/session/login', csrf, async (req, res) => {
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ error: 'Yönetim şifresi gerekli.' });
    try {
      req.localSession.remoteToken = await remoteClient.login(password);
      res.json({ authenticated: true });
    } catch (error) {
      sessions.clearRemoteToken(req.localSession);
      res.status(errorStatus(error, 502)).json({ error: error.message });
    }
  });

  app.post('/local-api/session/logout', csrf, (req, res) => {
    sessions.clearRemoteToken(req.localSession);
    res.json({ authenticated: false });
  });

  app.use('/local-api/admin', csrf, async (req, res) => {
    const session = req.localSession;
    if (!session.remoteToken) return res.status(401).json({ error: 'Yönetim oturumu gerekli.' });
    try {
      const upstream = await remoteClient.proxy(req, session.remoteToken);
      if (upstream.status === 401) sessions.clearRemoteToken(session);
      for (const header of ['content-type', 'content-disposition', 'cache-control']) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status).send(bytes);
    } catch (error) {
      res.status(errorStatus(error)).json({ error: error.message || 'Uzak sunucuya ulaşılamadı.' });
    }
  });

  app.use('/local-api', (_req, res) => res.status(404).json({ error: 'Lokal API yolu bulunamadı.' }));

  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, etag: true, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(join(distDir, 'index.html')));
  } else {
    app.get('/', (_req, res) => res.type('text').send('Yedigül Lokal Yönetim kontrol katmanı çalışıyor. Arayüz için npm run dev kullanın.'));
  }

  const pruneTimer = setInterval(() => sessions.prune(), 30 * 60 * 1000);
  pruneTimer.unref?.();
  return app;
}

