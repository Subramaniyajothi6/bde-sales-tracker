import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { fmtDate, initials } from '../../lib/format';
import { PasswordForm } from '../ChangePassword';

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  const facts: [string, string][] = [
    ['Employee ID', user.employeeId], ['Mobile', user.phone], ['Email', user.email ?? '–'],
    ['Joined', `${fmtDate(user.joinedOn)} ${user.joinedOn.slice(0, 4)}`], ['Daily target', `${user.dailyTarget} calls`]
  ];
  return (
    <>
      <section className="bde-head">
        <div className="top"><Link to="/bde/me">‹ My month</Link></div>
        <div className="avatar" aria-hidden="true">{initials(user.name)}</div>
        <h1>{user.name}</h1>
      </section>
      <main className="bde-main">
        <section className="sec">
          <h2>My details</h2>
          <div className="panel panel-pad"><dl className="facts">{facts.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
          <p className="small muted" style={{ margin: 0 }}>To change your name, phone or email, ask your admin.</p>
        </section>
        <section className="sec">
          <h2>Change password</h2>
          <div className="panel panel-pad"><PasswordForm /></div>
        </section>
        <button type="button" className="btn ghost block" onClick={async () => { await logout(); nav('/login'); }}>Log out</button>
      </main>
    </>
  );
}
