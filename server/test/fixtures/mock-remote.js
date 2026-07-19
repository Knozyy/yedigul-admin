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
app.get('/api/admin/stats', (_req, res) => res.json({ today: { menu_view: 12 }, week: { menu_view: 70 }, month: { qr_scan: 33 } }));
app.get('/api/admin/history', (_req, res) => res.json({ entries: [{ id: 1, action: 'update', entity: 'product', detail: 'Levrek: fiyat güncellendi', created_at: '2026-07-20 03:00' }] }));
app.get('/api/admin/settings', (_req, res) => res.json({ public_base_url: 'https://www.yedigulrestorant.com', menu_path: '/menu/' }));

app.listen(port, '127.0.0.1', () => console.log(`Mock remote admin: http://127.0.0.1:${port}`));
