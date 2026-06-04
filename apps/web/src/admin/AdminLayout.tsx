import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, applyBranding } from '../api';

export interface Me {
  user: { id: string; username: string; role: 'admin' | 'member' };
  org_id: string;
  project_id: string;
  must_change_password: boolean;
}

export function AdminLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('SessionVault');
  const [logo, setLogo] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    api.me()
      .then((m) => {
        setMe(m);
        return api.getBranding();
      })
      .then((d) => {
        applyBranding(d.branding);
        setName(d.branding.productName);
        setLogo(d.branding.logoUrl);
      })
      .catch((e) => {
        if (e.status === 401) nav('/admin/login', { replace: true });
      })
      .finally(() => setChecked(true));
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    nav('/admin/login', { replace: true });
  }

  if (!checked) return <div className="center"><p className="muted">Loading…</p></div>;
  if (!me) return null;

  return (
    <div>
      <div className="topbar">
        <span className="brand" data-has-logo={logo ? 'true' : 'false'}>
          {logo && <img src={logo} alt="" style={{ height: 24 }} />}
          {name}
        </span>
        <nav>
          <NavLink to="/admin/sessions">Sessions</NavLink>
          <NavLink to="/admin/templates">Templates</NavLink>
          <NavLink to="/admin/team">Team</NavLink>
          <NavLink to="/admin/settings">Customize</NavLink>
        </nav>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button className="ghost" onClick={() => setMenu((m) => !m)} data-testid="user-menu">
            {me.user.username} <span className="tag" style={{ marginLeft: 6 }}>{me.user.role}</span> ▾
          </button>
          {menu && (
            <div className="usermenu" onMouseLeave={() => setMenu(false)}>
              <button className="ghost" onClick={() => { setMenu(false); nav('/admin/account'); }}>Change password</button>
              <button className="ghost" onClick={logout} data-testid="logout">Sign out</button>
            </div>
          )}
        </div>
      </div>
      {me.must_change_password && (
        <div className="container" style={{ paddingBottom: 0 }}>
          <div className="banner warn" data-testid="default-pw-warning">
            You're still using the default password.{' '}
            <a onClick={() => nav('/admin/account')} style={{ cursor: 'pointer' }}>Change it now</a> to secure your workspace.
          </div>
        </div>
      )}
      <div className="container">
        <Outlet context={me} />
      </div>
    </div>
  );
}
