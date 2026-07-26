import express from 'express';

const app = express();
const port = Number(process.env.MOCK_REMOTE_PORT || 43202);
const token = 'local-ui-test-token';
app.use(express.json());

app.post('/api/auth/login', (req, res) => {
  if (req.body?.password !== 'test-panel') return res.status(401).json({ error: 'Hatalı şifre' });
  res.json({ authenticated: true, token });
});

app.use('/api/admin', (req, res, next) => {
  if (req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'Yetkisiz' });
  next();
});

app.get('/api/admin/menu', (_req, res) => res.json({
  categories: [{ id: 'fish', name_tr: 'Balıklar', name_en: 'Fish', name_ar: 'سمك', name_ru: 'Рыба', sort: 1, is_active: 1 }],
  products: [{
    id: 'levrek', category_id: 'fish', name_tr: 'Levrek', name_en: 'Sea Bass', name_ar: 'قاروص', name_ru: 'Сибас',
    desc_tr: 'Günlük taze levrek.', desc_en: 'Daily fresh sea bass.', desc_ar: '', desc_ru: '',
    price: 850, kcal: 320, portion: '350 gr', sort: 1, is_market_price: 0, is_available: 1,
    is_hidden: 0, popular: 1, chef: 0, diet: ['gf'],
    ing_tr: ['Levrek', 'Limon'], ing_en: ['Sea bass', 'Lemon'], ing_ar: [], ing_ru: [],
    alg_tr: ['Balık'], alg_en: ['Fish'], alg_ar: [], alg_ru: [],
    variants: [{ name_tr: 'Porsiyon', name_en: 'Portion', name_ar: '', name_ru: '', price: 850 }],
    images: [], image_url: null,
  }],
}));
// Gerçek backend gibi: hafta sonu ağırlıklı, VE hiç ziyaret almayan günü
// stats_daily'ye hiç yazmadığı için en sakin iki hafta içi günü dizide YOK.
// Pano bunları sıfırla doldurup takvimde doğru güne oturtmak zorunda.
function localDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function buildDays() {
  const rows = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const weekday = (date.getDay() + 6) % 7;
    let base;
    if (weekday === 5) base = 200 + Math.round(Math.random() * 60);
    else if (weekday === 6) base = 170 + Math.round(Math.random() * 55);
    else if (weekday === 4) base = 110 + Math.round(Math.random() * 40);
    else base = 45 + Math.round(Math.random() * 50);
    rows.push({ day: localDay(date), menu_view: base, qr_scan: Math.round(base * 0.62), weekday });
  }
  const eksiltilecek = rows
    .filter((row) => row.weekday < 4)
    .sort((a, b) => a.menu_view - b.menu_view)
    .slice(0, 2)
    .map((row) => row.day);
  return rows.filter((row) => !eksiltilecek.includes(row.day)).map(({ weekday: _weekday, ...row }) => row);
}

const DAYS = buildDays();

app.get('/api/admin/stats', (_req, res) => {
  const today = localDay(new Date());
  const sum = (n, key) => DAYS.slice(-n).reduce((a, d) => a + d[key], 0);
  res.json({
    today: DAYS.find((d) => d.day === today) || { day: today, menu_view: 0, qr_scan: 0 },
    week: { menu_view: sum(7, 'menu_view'), qr_scan: sum(7, 'qr_scan') },
    month: { menu_view: sum(30, 'menu_view'), qr_scan: sum(30, 'qr_scan') },
    days: DAYS,
  });
});
app.get('/api/admin/history', (_req, res) => res.json({ entries: [{ id: 1, action: 'update', entity: 'product', detail: 'Levrek: fiyat güncellendi', created_at: '2026-07-20 03:00' }] }));
app.get('/api/admin/settings', (_req, res) => res.json({ public_base_url: 'https://www.yedigulrestorant.com', menu_path: '/menu/' }));

app.listen(port, '127.0.0.1', () => console.log(`Mock remote admin: http://127.0.0.1:${port}`));
