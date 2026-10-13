import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { useUnreadChat } from '../pages/Chat';
import { LEAVES_CHANGED } from '../pages/admin/Attendance';

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
  team: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>),
  attendance: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  chat: svg(<path d="M4 5h16v11H9l-5 4z" />),
  activity: svg(<path d="M3 12h4l3-8 4 16 3-8h4" />)
};

/** Fired after a receipt is verified or rejected, so the sidebar count updates. */
export const RECEIPTS_CHANGED = 'receipts-changed';

function useBodyRole(role: 'admin' | 'bde') {
  useEffect(() => {
    document.body.dataset.role = role;
    return () => { delete document.body.dataset.role; };
  }, [role]);
}

/** Counts shown as pills in the admin menu: receipts and leave requests waiting. */
function useAdminCounts(enabled: boolean) {
  const [receipts, setReceipts] = useState(0);
  const [leaves, setLeaves] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const loadReceipts = () => api.payments.list('verify').then(r => setReceipts(r.summary.toVerify)).catch(() => {});
    const loadLeaves = () => api.leaves.list('pending').then(r => setLeaves(r.pending)).catch(() => {});
    loadReceipts(); loadLeaves();
    window.addEventListener(RECEIPTS_CHANGED, loadReceipts);
    window.addEventListener(LEAVES_CHANGED, loadLeaves);
    return () => { window.removeEventListener(RECEIPTS_CHANGED, loadReceipts); window.removeEventListener(LEAVES_CHANGED, loadLeaves); };
  }, [enabled]);
  return { receipts, leaves };
}

/**
 * The frame around every page, for both admin and BDE: a sidebar on a laptop,
 * and below 960px a top bar whose menu (☰) button on the right drops the menu down from the top.
 */
function Shell({ role }: { role: 'admin' | 'bde' }) {
  useBodyRole(role);
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const counts = useAdminCounts(role === 'admin');
  const unread = useUnreadChat();
  // Below 960px: the pages menu (☰) and the account box (initials) open from the top bar, one at a time
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const closeAll = () => { setMenuOpen(false); setAccountOpen(false); };

  useEffect(closeAll, [pathname]);
  useEffect(() => {
    if (!menuOpen && !accountOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, accountOpen]);
  const signOut = async () => { await logout(); nav('/login'); };

  const home = `/${role}`;
  // [path, label, icon, count shown as a pill, what the count means]
  const items: [string, string, ReactNode, number, string][] = role === 'admin' ? [
    ['/admin', 'Dashboard', ICON.dashboard, 0, ''], ['/admin/daily-reports', 'Daily reports', ICON.daily, 0, ''],
    ['/admin/attendance', 'Attendance', ICON.attendance, counts.leaves, 'leave requests waiting'], ['/admin/leads', 'Leads', ICON.leads, 0, ''],
    ['/admin/interviews', 'Interviews', ICON.interviews, 0, ''], ['/admin/payments', 'Payments', ICON.payments, counts.receipts, 'receipts to verify'],
    ['/admin/reports', 'Monthly report', ICON.reports, 0, ''], ['/admin/chat', 'Chat', ICON.chat, unread, 'unread messages'],
    ['/admin/team', 'Team', ICON.team, 0, ''], ['/admin/activity', 'Activity', ICON.activity, 0, '']
  ] : [
    ['/bde', 'Today', ICON.reports, 0, ''], ['/bde/leads', 'My leads', ICON.leads, 0, ''],
    ['/bde/interviews', 'Interviews', ICON.interviews, 0, ''], ['/bde/payments', 'Payments', ICON.payments, 0, ''],
    ['/bde/me', 'My month', ICON.attendance, 0, ''], ['/bde/chat', 'Chat', ICON.chat, unread, 'unread messages'],
    ['/bde/me/profile', 'Profile', ICON.team, 0, '']
  ];
  const anyCount = items.some(i => i[3] > 0);

  return (
    <>
      <header className="topbar">
        <NavLink className="brand" to={home}>ADZ4NEEDZ</NavLink>
        <div className="topbar-end">
          <button type="button" className={`acct-btn${accountOpen ? ' on' : ''}`} aria-label="Your account" aria-expanded={accountOpen} aria-controls="account-box"
            onClick={() => { setMenuOpen(false); setAccountOpen(o => !o); }}>{initials(user?.name ?? '')}</button>
          {/* The same button opens and closes the pages menu, which drops down under this bar */}
          <button type="button" className="menu-btn" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="main-menu"
            onClick={() => { setAccountOpen(false); setMenuOpen(o => !o); }}>
            {menuOpen ? svg(<path d="M6 6l12 12M18 6L6 18" />) : svg(<path d="M4 6h16M4 12h16M4 18h16" />)}
            {anyCount && !menuOpen && <span className="dot" aria-hidden="true" />}
          </button>
        </div>
        {accountOpen && (
          <div className="account-box" id="account-box" role="menu" aria-label="Your account">
            <div className="who"><b>{user?.name}</b><small>{user?.employeeId}</small></div>
            {role === 'bde'
              ? <NavLink role="menuitem" to="/bde/me/profile">My profile</NavLink>
              : <NavLink role="menuitem" to="/change-password">Change password</NavLink>}
            <button type="button" role="menuitem" className="out" onClick={signOut}>Log out</button>
          </div>
        )}
      </header>
      {(menuOpen || accountOpen) && <div className={`scrim${accountOpen ? ' clear' : ''}`} aria-hidden="true" onClick={closeAll} />}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} id="main-menu">
        <div className="side-top">
          <NavLink className="brand" to={home}><span>ADZ4NEEDZ<small>BDE Sales Tracker</small></span></NavLink>
        </div>
        <nav aria-label="Main">
          {items.map(([to, label, icon, n, what]) => (
            <NavLink key={to} to={to} end={to === home || to === '/bde/me'}>
              {icon}{label}
              {n > 0 && <span className={`pill${label === 'Chat' ? ' blue' : ''}`} aria-label={`${n} ${what}`}>{n}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="av" aria-hidden="true">{initials(user?.name ?? '')}</span>
          <span className="who-txt">
            <b>{user?.name}</b>
            <small className="muted">{user?.employeeId}</small>
            <button type="button" className="linkbtn" style={{ padding: 0, minHeight: 0, color: 'var(--soft)', fontWeight: 400 }} onClick={signOut}>Log out</button>
          </span>
        </div>
      </aside>
      <Outlet />
    </>
  );
}

export const AdminShell = () => <Shell role="admin" />;
export const BdeShell = () => <Shell role="bde" />;
