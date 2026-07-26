import { localDay } from '../cache.js';
import { Unconfigured } from './runner.js';

const GRAPH = 'https://graph.facebook.com/v25.0';
const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';
const TOKEN_NAME = 'instagram';
const DAY_MS = 86400000;

// Uzun ömürlü token 60 gün geçerli. 14 günden az kalınca yenilenir; Meta
// token'ın en az 24 saatlik olmasını şart koştuğu için taze token yenilenmez.
const REFRESH_BELOW_MS = 14 * DAY_MS;
const MIN_TOKEN_AGE_MS = 25 * 60 * 60 * 1000;

/**
 * Meta'nın kaldırdığı metrikleri KULLANMIYORUZ: `impressions` (v22) ve
 * `profile_views` artık desteklenmiyor. Aşağıdakilerin tamamı
 * `metric_type=total_value` ister — parametre unutulursa API hata döner.
 */
const INSIGHT_METRICS = ['reach', 'views', 'total_interactions', 'accounts_engaged'];

async function graphJson(url, hata) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw Object.assign(new Error(`${hata}: ağa çıkılamadı.`), { cause: error });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const detay = data.error?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(`${hata}: ${detay}`), { igCode: data.error?.code });
  }
  return data;
}

/**
 * Geçerli token'ı bulur ve gerekiyorsa yeniler.
 *
 * .env'deki değer yalnızca TOHUM'dur: ilk çalıştırmada veritabanına yazılır,
 * sonraki yenilemeler orada tutulur. Aksi hâlde 60 gün sonra pano sessizce
 * ölürdü — kullanıcı .env'i elle güncellemek zorunda kalırdı.
 *
 * .env'deki token değiştirilirse (kullanıcı yeni token ürettiyse) o kazanır.
 */
async function resolveToken(config, cache) {
  const seed = config.instagram.accessToken;
  const stored = cache?.getToken(TOKEN_NAME) || null;
  const seedChanged = stored && stored.value !== seed && !stored.seededFrom;

  let token = stored?.value || seed;
  let expiresAt = stored?.expires_at ?? null;
  let refreshedAt = stored?.refreshed_at ?? null;

  // .env'e elle yeni token girilmişse saklanan eskisini bırak.
  if (!stored || (seedChanged && !stored.expires_at)) {
    token = seed;
    expiresAt = null;
    refreshedAt = null;
  }

  const age = refreshedAt ? Date.now() - refreshedAt : null;
  const kalan = expiresAt ? expiresAt - Date.now() : null;
  const yenilenebilir = age === null || age > MIN_TOKEN_AGE_MS;
  const yenilenmeli = kalan === null || kalan < REFRESH_BELOW_MS;

  if (cache && yenilenmeli && yenilenebilir) {
    try {
      const url = `${REFRESH_URL}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
      const data = await graphJson(url, 'Token yenilenemedi');
      if (data.access_token) {
        token = data.access_token;
        expiresAt = Date.now() + Number(data.expires_in || 0) * 1000;
        cache.setToken(TOKEN_NAME, token, expiresAt);
      }
    } catch (error) {
      // Yenileme başarısız olabilir (ör. Facebook Login ile üretilmiş token
      // bu uca uymaz). Veri çekmeyi engellememeli; kart uyarıyı gösterir.
      return { token, expiresAt, refreshWarning: error.message };
    }
  } else if (cache && !stored) {
    cache.setToken(TOKEN_NAME, token, expiresAt);
  }

  return { token, expiresAt, refreshWarning: '' };
}

function unixDaysAgo(days) {
  return Math.floor((Date.now() - days * DAY_MS) / 1000);
}

/** total_value biçimindeki insights yanıtını düz bir nesneye indirger. */
function readInsights(payload) {
  const out = {};
  for (const entry of payload?.data || []) {
    const value = entry.total_value?.value;
    if (Number.isFinite(value)) out[entry.name] = value;
  }
  return out;
}

export const instagram = {
  id: 'instagram',
  label: 'Instagram',
  ttlMs: 15 * 60 * 1000,
  version: 1,

  guard({ config }) {
    const { userId, accessToken } = config.instagram;
    if (!userId || !accessToken) {
      throw new Unconfigured(
        'Faz 2’de açılır. Takipçi sayısı, erişim ve son gönderi etkileşimleri için Meta uygulaması ve uzun ömürlü token gerekiyor.',
        '.env → IG_USER_ID ve IG_ACCESS_TOKEN',
      );
    }
  },

  async load({ config, cache }) {
    const { userId } = config.instagram;
    const { token, expiresAt, refreshWarning } = await resolveToken(config, cache);
    const auth = `access_token=${encodeURIComponent(token)}`;

    // Profil zorunlu; insights ve gönderiler olmasa da kart doludur.
    const profile = await graphJson(
      `${GRAPH}/${userId}?fields=username,followers_count,follows_count,media_count&${auth}`,
      'Instagram profili okunamadı',
    );

    const [insights, media] = await Promise.all([
      graphJson(
        `${GRAPH}/${userId}/insights?metric=${INSIGHT_METRICS.join(',')}` +
          `&metric_type=total_value&period=day&since=${unixDaysAgo(30)}&until=${unixDaysAgo(0)}&${auth}`,
        'Insights okunamadı',
      ).catch((error) => ({ __error: error.message })),
      graphJson(
        `${GRAPH}/${userId}/media?fields=caption,permalink,media_type,timestamp,like_count,comments_count` +
          `&limit=6&${auth}`,
        'Gönderiler okunamadı',
      ).catch((error) => ({ __error: error.message })),
    ]);

    const gecmis = cache?.history('ig.followers', 30) || [];
    const ilk = gecmis.length ? gecmis[0].value : null;

    return {
      username: profile.username || '',
      followers: Number(profile.followers_count) || 0,
      follows: Number(profile.follows_count) || 0,
      mediaCount: Number(profile.media_count) || 0,
      // Takipçi geçmişini API VERMEZ; bu seri panonun kendi günlük anlık
      // görüntülerinden gelir, o yüzden ilk günler kısa görünür.
      followerHistory: gecmis,
      followerChange: ilk === null ? null : Number(profile.followers_count) - ilk,
      insights: insights.__error ? null : readInsights(insights),
      insightsError: insights.__error || '',
      posts: media.__error
        ? []
        : (media.data || []).map((post) => ({
            caption: (post.caption || '').slice(0, 120),
            permalink: post.permalink,
            type: post.media_type,
            timestamp: post.timestamp,
            likes: Number(post.like_count) || 0,
            comments: Number(post.comments_count) || 0,
          })),
      postsError: media.__error || '',
      token: {
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        daysLeft: expiresAt ? Math.floor((expiresAt - Date.now()) / DAY_MS) : null,
        warning: refreshWarning,
      },
    };
  },

  onLoad(data, { cache }) {
    cache?.snapshot('ig.followers', data.followers, localDay());
  },
};
