function joinUrl(base, path) {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseError(response) {
  const data = await response.json().catch(() => ({}));
  return data?.error || `Uzak sunucu hatası (${response.status})`;
}

export class RemoteClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async login(password) {
    let response;
    try {
      response = await this.fetch(joinUrl(this.config.remoteAdminBaseUrl, `${this.config.remoteAuthPath}/login`), {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw Object.assign(
        new Error('Sunucudaki özel admin servisine ulaşılamıyor. 127.0.0.1:3002 servisini kontrol edin.'),
        { status: 503, cause: error },
      );
    }
    if (!response.ok) throw Object.assign(new Error(await parseError(response)), { status: response.status });
    const data = await response.json();
    if (!data.token || typeof data.token !== 'string') {
      throw new Error('Uzak sunucu geçerli yönetim anahtarı döndürmedi.');
    }
    return data.token;
  }

  /**
   * Yönetim API'sinden JSON okur. Pano konektörleri bunu kullanır —
   * proxy() bir Express isteği ister, konektörlerin ise elinde istek yok.
   * path örneği: '/stats' veya '/history?limit=8'.
   */
  async read(path, token) {
    const url = joinUrl(this.config.remoteAdminBaseUrl, `${this.config.remoteAdminPath}${path}`);
    let response;
    try {
      response = await this.fetch(url, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw Object.assign(
        new Error('Sunucudaki özel admin servisi yanıt vermiyor.'),
        { status: 503, cause: error },
      );
    }
    if (!response.ok) {
      throw Object.assign(new Error(await parseError(response)), { status: response.status });
    }
    return response.json();
  }

  /**
   * Yönetim API'sine JSON yazar. read()'in POST kardeşi — konektörlerin ve
   * senkronun elinde bir Express isteği yok, o yüzden proxy() kullanılamaz.
   */
  async write(path, body, token) {
    const url = joinUrl(this.config.remoteAdminBaseUrl, `${this.config.remoteAdminPath}${path}`);
    let response;
    try {
      response = await this.fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw Object.assign(
        new Error('Sunucudaki özel admin servisi yanıt vermiyor.'),
        { status: 503, cause: error },
      );
    }
    if (!response.ok) {
      throw Object.assign(new Error(await parseError(response)), { status: response.status });
    }
    return response.json();
  }

  async proxy(req, token) {
    const suffix = req.originalUrl.slice('/local-api/admin'.length) || '/';
    const url = joinUrl(this.config.remoteAdminBaseUrl, `${this.config.remoteAdminPath}${suffix}`);
    const headers = { accept: req.headers.accept || 'application/json', authorization: `Bearer ${token}` };
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const contentType = req.headers['content-type'];
      if (contentType) headers['content-type'] = contentType;
      if (req.body !== undefined && contentType?.includes('json')) {
        body = Buffer.from(JSON.stringify(req.body));
      } else {
        body = await this.readBody(req);
      }
    }
    try {
      return await this.fetch(url, {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw Object.assign(
        new Error('Sunucudaki özel admin servisi yanıt vermiyor.'),
        { status: 503, cause: error },
      );
    }
  }

  async readBody(req) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > this.config.maxProxyBodyBytes) {
        throw Object.assign(new Error('İstek gövdesi çok büyük.'), { status: 413 });
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
