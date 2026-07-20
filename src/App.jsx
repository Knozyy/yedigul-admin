import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api.js';
import Shell from './components/Shell.jsx';
import { ConnectionGate, LoginGate } from './components/ConnectionGate.jsx';
import Overview from './views/Overview.jsx';
import Products from './views/Products.jsx';
import Categories from './views/Categories.jsx';
import Settings from './views/Settings.jsx';
import Connection from './views/Connection.jsx';

export default function App() {
  const [boot, setBoot] = useState(null);
  const [menu, setMenu] = useState({ categories: [], products: [] });
  const [active, setActive] = useState('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshBoot = useCallback(async () => {
    const data = await api.bootstrap();
    setBoot(data);
    return data;
  }, []);

  const reloadMenu = useCallback(async () => {
    const data = await api.get('/admin/menu');
    setMenu(data);
    return data;
  }, []);

  useEffect(() => {
    refreshBoot().then((data) => data.authenticated ? reloadMenu() : null).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [refreshBoot, reloadMenu]);

  async function connect() {
    setError('');
    try { setBoot(await api.post('/tunnel/connect')); } catch (e) { setError(e.message); if (e.data?.tunnel) setBoot((old) => ({ ...old, tunnel: e.data.tunnel })); }
  }

  async function login(password) {
    setError('');
    try { await api.post('/session/login', { password }); const data = await refreshBoot(); await reloadMenu(); setBoot({ ...data, authenticated: true }); }
    catch (e) { setError(e.message); }
  }

  async function logout() {
    await api.post('/session/logout').catch(() => {});
    setMenu({ categories: [], products: [] });
    setActive('overview');
    await refreshBoot();
  }

  async function disconnect() {
    if (!window.confirm('Yönetim oturumu kapatılıp SSH tüneli sonlandırılsın mı?')) return;
    setBoot(await api.post('/tunnel/disconnect'));
    setMenu({ categories: [], products: [] });
    setActive('overview');
  }

  const request = useCallback(async (method, path, body) => {
    try { return await api[method](path, body); }
    catch (e) {
      if (e.status === 401) {
        setBoot((old) => ({ ...old, authenticated: false }));
        setError('Canlı yönetim oturumunun süresi doldu. Yeniden giriş yapın.');
      }
      throw e;
    }
  }, []);

  if (loading) return <div className="splash"><span className="brand-mark large">Y</span><p>Lokal yönetim hazırlanıyor…</p></div>;
  if (!boot) return <div className="splash error-splash"><h1>Uygulama başlatılamadı</h1><p>{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Yeniden dene</button></div>;

  const connected = boot.tunnel.mode === 'direct' || boot.tunnel.state === 'connected';
  if (!connected) return <ConnectionGate tunnel={boot.tunnel} onConnect={connect} error={error} />;
  if (!boot.authenticated) return <LoginGate onLogin={login} error={error} />;

  const views = {
    overview: <Overview menu={menu} />,
    products: <Products menu={menu} onReload={reloadMenu} request={request} publicMenuUrl={boot.publicMenuUrl} />,
    categories: <Categories menu={menu} onReload={reloadMenu} request={request} />,
    settings: <Settings request={request} />,
    connection: <Connection boot={boot} onDisconnect={disconnect} />,
  };
  return <Shell active={active} onSelect={setActive} onLogout={logout} publicMenuUrl={boot.publicMenuUrl}>{views[active]}</Shell>;
}
