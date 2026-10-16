import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/hooks';

export function homeFor(role: 'ADMIN' | 'BDE') {
  return role === 'ADMIN' ? '/admin' : '/bde';
}

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [eid, setEid] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setHint('');
    if (!eid.trim()) return setErr('Enter your employee ID, like BDE-014.');
    if (!pw) return setErr('Enter your password.');
    setBusy(true);
    try {
      const user = await login(eid.trim(), pw);
      nav(user.mustChangePassword ? '/change-password' : homeFor(user.role), { replace: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <span className="brand"><span>ADZ4NEEDZ<small>BDE Sales Tracker</small></span></span>
      <main className="inner">
        <div>
          <h1>Sign in</h1>
          <p className="lede">Use your employee ID and password.</p>
        </div>
        <form noValidate onSubmit={submit}>
          <label className="field">Employee ID
            <input className={`input${err && !eid.trim() ? ' bad' : ''}`} value={eid} onChange={e => { setEid(e.target.value); setErr(''); }}
              autoComplete="username" placeholder="e.g. BDE-014" autoCapitalize="characters" autoFocus />
          </label>
          <label className="field">Password
            <span className="pw">
              <input className="input" type={show ? 'text' : 'password'} value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} autoComplete="current-password" />
              <button type="button" className="linkbtn" aria-pressed={show} onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button>
            </span>
          </label>
          {err && <span className="err" role="alert">{err}</span>}
          <button type="submit" className="btn block" style={{ minHeight: 44 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setHint('Ask your admin to reset it. They can do this from the Team page.')}>
            Forgot your password?
          </button>
          {hint && <span className="small muted" role="status">{hint}</span>}
        </form>
      </main>
      <span className="foot">ADZ4NEEDZ Pvt Ltd. For internal use by the sales team.</span>
    </div>
  );
}
