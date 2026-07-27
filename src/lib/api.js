let csrfToken = '';

// Oturum boyunca değişmeyen bir bayrak. Dört seviye prop olarak taşımak yerine
// csrf ile aynı modül durumunda duruyor — anahtarın kendisi değil, yalnızca
// "Çevir düğmesi çizilsin mi" bilgisi.
let translateEnabled = false;

function setCsrf(value) {
  csrfToken = String(value || '');
}

export function translationEnabled() {
  return translateEnabled;
}

async function request(method, path, body) {
  const headers = { accept: 'application/json' };
  const options = { method, headers, credentials: 'include' };
  if (!['GET', 'HEAD'].includes(method)) headers['x-csrf-token'] = csrfToken;
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/local-api${path}`, options);
  } catch {
    throw new Error('Lokal kontrol katmanına ulaşılamıyor.');
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const error = new Error(data?.error || `İstek başarısız (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  async bootstrap() {
    const data = await request('GET', '/bootstrap');
    setCsrf(data.csrf);
    translateEnabled = Boolean(data.translate);
    return data;
  },
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};

