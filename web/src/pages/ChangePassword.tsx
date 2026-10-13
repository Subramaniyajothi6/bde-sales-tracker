import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../lib/auth';
import { errorText, useToast } from '../lib/hooks';
import { homeFor } from './Login';

/** Form used on first login (forced) and from the BDE profile page. */
export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cur) return setErr('Enter your current password.');
    if (nw.length < 8 || !/\d/.test(nw) || !/[a-z]/i.test(nw)) return setErr('The new password needs at least 8 characters, with a letter and a number.');
    if (nw !== nw2) return setErr("The two new passwords don't match.");
    setBusy(true);
    try {
      const r = await api.auth.changePassword(cur, nw);
      setUser(r.user);
      setCur(''); setNw(''); setNw2(''); setErr('');
      toast('Password changed');
      onDone?.();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="form-col">
      <label className="field">Current password<input className="input" type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" /></label>
      <label className="field">New password<input className="input" type="password" value={nw} onChange={e => setNw(e.target.value)} autoComplete="new-password" />
        <span className="hint">At least 8 characters, with a letter and a number.</span></label>
      <label className="field">Type the new password again<input className="input" type="password" value={nw2} onChange={e => setNw2(e.target.value)} autoComplete="new-password" /></label>
      {err && <span className="err" role="alert">{err}</span>}
      <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

export default function ChangePassword() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="signin">
      <span className="brand"><span>ADZ4NEEDZ<small>BDE Sales Tracker</small></span></span>
      <main className="inner">
        <div>
          <h1>Set your password</h1>
          <p className="lede">You signed in with a temporary password. Choose your own to continue.</p>
        </div>
        <PasswordForm onDone={() => user && nav(homeFor(user.role), { replace: true })} />
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={async () => { await logout(); nav('/login'); }}>Log out</button>
      </main>
    </div>
  );
}
