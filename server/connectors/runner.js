/**
 * Konektör sözleşmesi.
 *
 * Altı kaynaklı bir panoda tek bir kaynağın çökmesi panoyu karartmamalı.
 * Bu yüzden her konektör istisnasız üç durumdan biriyle döner ve arayüz
 * üçünü de ayrı çizer:
 *
 *   ok           — veri taze geldi (ya da TTL içindeki önbellekten)
 *   unconfigured — anahtar/token girilmemiş; kullanıcı hatası değil, sıradaki faz
 *   error        — yapılandırılmış ama çağrı başarısız; varsa bayat veri gösterilir
 *
 * Konektör "henüz kurulmadı" demek için Unconfigured fırlatır; başka her
 * istisna 'error' sayılır.
 */
export class Unconfigured extends Error {
  constructor(message, hint = '') {
    super(message);
    this.name = 'Unconfigured';
    this.hint = hint;
  }
}

export async function runConnector(connector, ctx) {
  const { cache } = ctx;

  // guard() ÖNBELLEKTEN ÖNCE çalışır. Sıra tersine dönerse oturumu kapatmış
  // bir kullanıcıya, önceki oturumda çekilmiş veri gösterilir; "anahtar
  // silindi" durumunda da panel TTL boyunca bağlıymış gibi görünür.
  try {
    connector.guard?.(ctx);
  } catch (error) {
    if (error instanceof Unconfigured) {
      return {
        id: connector.id,
        label: connector.label,
        status: 'unconfigured',
        message: error.message,
        hint: error.hint,
      };
    }
    throw error;
  }

  const version = connector.version ?? 1;
  const cached = cache?.read(connector.id, version) || null;
  const ttl = connector.ttlMs ?? 5 * 60 * 1000;

  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return {
      id: connector.id,
      label: connector.label,
      status: 'ok',
      data: cached.data,
      fetchedAt: cached.fetchedAt,
      stale: false,
    };
  }

  try {
    const data = await connector.load(ctx);
    const fetchedAt = Date.now();
    cache?.write(connector.id, data, fetchedAt, version);
    connector.onLoad?.(data, ctx);
    return { id: connector.id, label: connector.label, status: 'ok', data, fetchedAt, stale: false };
  } catch (error) {
    if (error instanceof Unconfigured) {
      return {
        id: connector.id,
        label: connector.label,
        status: 'unconfigured',
        message: error.message,
        hint: error.hint,
      };
    }
    // Yapılandırılmış ama çağrı düştü: elde bayat veri varsa onu göster,
    // sessizce boş dönmektense "ne zamanki veriye bakıyorsun" bilgisini ver.
    return {
      id: connector.id,
      label: connector.label,
      status: 'error',
      error: String(error?.message || error).slice(0, 300),
      data: cached?.data ?? null,
      fetchedAt: cached?.fetchedAt ?? null,
      stale: Boolean(cached),
    };
  }
}

export function runAll(connectors, ctx) {
  return Promise.all(connectors.map((connector) => runConnector(connector, ctx)));
}
