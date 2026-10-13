import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICON = {
  dashboard: svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  daily: svg(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
  leads: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.7c2 .6 3.5 2.4 3.5 5.3" /></>),
  interviews: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  payments: svg(<><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10.5h19M6.5 15h4" /></>),
  reports: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  team: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>)
};

/** Fired after a receipt is verified or rejected, so the sidebar count updates. */
export const RECEIPTS_CHANGED = 'receipts-changed';

function useBodyRole(role: 'admin' | 'bde') {
  useEffect(() => {
    document.body.dataset.role = role;
    document.body.classList.toggle('has-tabs', role === 'bde');
    return () => { delete document.body.dataset.role; document.body.classList.remove('has-tabs'); };
  }, [role]);
}

export function AdminShell() {
  useBodyRole('admin');
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const load = () => api.payments.list('verify').then(r => setWaiting(r.summary.toVerify)).catch(() => {});
    load();
    window.addEventListener(RECEIPTS_CHANGED, load);
    return () => window.removeEventListener(RECEIPTS_CHANGED, load);
  }, []);

  const items: [string, string, ReactNode][] = [
    ['/admin', 'Dashboard', ICON.dashboard], ['/admin/daily-reports', 'Daily reports', ICON.daily], ['/admin/leads', 'Leads', ICON.leads],
    ['/admin/interviews', 'Interviews', ICON.interviews], ['/admin/payments', 'Payments', ICON.payments],
    ['/admin/reports', 'Monthly report', ICON.reports], ['/admin/team', 'Team', ICON.team]
  ];
  return (
    <>
      <aside className="sidebar">
        <NavLink className="brand" to="/admin"><span>ADZ4NEEDZ<small>BDE Sales Tracker</small></span></NavLink>
        <nav aria-label="Main">
          {items.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/admin'}>
              {icon}{label}
              {label === 'Payments' && waiting > 0 && <span className="pill" aria-label={`${waiting} to verify`}>{waiting}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="av" aria-hidden="true">{initials(user?.name ?? 'Admin')}</span>
          <span className="who-txt">
            <b>{user?.name}</b>
            <button type="button" className="linkbtn" style={{ padding: 0, minHeight: 0, color: 'var(--soft)', fontWeight: 400 }}
              onClick={async () => { await logout(); nav('/login'); }}>Log out</button>
          </span>
        </div>
      </aside>
      <Outlet />
    </>
  );
}

export function BdeShell() {
  useBodyRole('bde');
  const tab = (d: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
  const items: [string, string, ReactNode][] = [
    ['/bde', 'Today', tab(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />)],
    ['/bde/leads', 'Leads', tab(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.7c2 .6 3.5 2.4 3.5 5.3" /></>)],
    ['/bde/interviews', 'Interviews', tab(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>)],
    ['/bde/payments', 'Payments', tab(<><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10.5h19M6.5 15h4" /></>)],
    ['/bde/me', 'Me', tab(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>)]
  ];
  return (
    <div className="bde-app">
      <Outlet />
      <nav className="tabbar" aria-label="Main">
        {items.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/bde'}>{icon}{label}</NavLink>)}
      </nav>
    </div>
  );
}
