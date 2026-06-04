import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, applyBranding } from '../api';

export function AdminLayout() {
  const [name, setName] = useState('SessionVault');
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    api.getBranding()
      .then((d) => {
        applyBranding(d.branding);
        setName(d.branding.productName);
        setLogo(d.branding.logoUrl);
      })
      .catch(() => {});
  }, []);

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
          <NavLink to="/admin/settings">Customize</NavLink>
        </nav>
        <span style={{ marginLeft: 'auto' }} className="muted">
          admin@sessionvault.local
        </span>
      </div>
      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}
