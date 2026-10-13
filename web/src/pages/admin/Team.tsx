import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type User } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { fmtDate, istDate, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, Modal } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

export default function Team() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const { data, error, reload } = useLoad(() => api.users.list({ status, q: q.trim() || undefined }), [status, q]);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [shown, setShown] = useState<{ name: string; id: string; pw: string } | null>(null);

  async function toggle(u: User) {
    if (u.active && confirmId !== u.id) return setConfirmId(u.id);
    setConfirmId(null);
    try {
      await api.users.update(u.id, { active: !u.active });
      toast(u.active ? `${u.name} is deactivated. Their past reports are kept.` : `${u.name} can log in again`);
      await reload();
    } catch (e) { toast(errorText(e)); }
  }
  async function reset(u: User) {
    try {
      const r = await api.users.resetPassword(u.id);
      setShown({ name: u.name, id: u.employeeId, pw: r.temporaryPassword });
    } catch (e) { toast(errorText(e)); }
  }
  const lastLogin = (u: User) => !u.lastLoginAt ? <span className="muted">Not yet</span> : istDate(u.lastLoginAt) === todayIST() ? 'Today' : fmtDate(istDate(u.lastLoginAt));

  return (
    <>
      <PageHead title="Team" tools={<button type="button" className="btn" onClick={() => setAdding(true)}>Add BDE</button>} />
      <main className="wrap">
        <section className="panel">
          <div className="toolbar">
            <label className="sr-only" htmlFor="q">Find a BDE</label>
            <input className="input search" id="q" type="search" placeholder="Find by name, ID or phone" value={q} onChange={e => setQ(e.target.value)} />
            <label className="sr-only" htmlFor="show">Show</label>
            <select className="select" id="show" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
              <option value="active">Active</option><option value="inactive">Deactivated</option><option value="all">Everyone</option>
            </select>
          </div>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
            <div className="scroll">
              <table className="data">
                <thead><tr><th scope="col">BDE</th><th scope="col">Employee ID</th><th scope="col">Phone</th><th scope="col">Last login</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.users.map(u => (
                    <tr key={u.id}>
                      <td className="who"><Link to={`/admin/bde/${u.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><b>{u.name}</b></Link></td>
                      <td className="muted">{u.employeeId}</td>
                      <td>{u.phone}</td>
                      <td>{lastLogin(u)}</td>
                      <td><Badge label={u.active ? 'Active' : 'Inactive'} /></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button type="button" className="linkbtn" onClick={() => reset(u)}>Reset password</button>
                        <button type="button" className={`linkbtn${u.active ? ' red' : ''}`} onClick={() => toggle(u)} onBlur={() => confirmId === u.id && setConfirmId(null)}>
                          {u.active ? (confirmId === u.id ? 'Click again to confirm' : 'Deactivate') : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!data.users.length && <tr><td colSpan={6}><Empty title="No one matches" /></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <AddBde open={adding} onClose={() => setAdding(false)} onAdded={(u, pw) => { setAdding(false); setShown({ name: u.name, id: u.employeeId, pw }); void reload(); }} />
      <Modal open={!!shown} title="Login details" onClose={() => setShown(null)} footer={<button type="button" className="btn" onClick={() => setShown(null)}>Done</button>}>
        {shown && <>
          <p style={{ fontSize: 16, margin: 0 }}><b>{shown.name}</b> can now log in.</p>
          <div className="temp-pw"><span className="muted">Employee ID</span><b>{shown.id}</b><span className="muted">Temporary password</span><b>{shown.pw}</b></div>
          <p className="muted small" style={{ margin: 0 }}>Share these privately. This password is shown only once. They'll set their own password when they first log in.</p>
        </>}
      </Modal>
    </>
  );
}

function AddBde({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (u: User, pw: string) => void }) {
  const next = useLoad(() => (open ? api.users.nextId() : Promise.resolve(null)), [open]);
  const [f, setF] = useState({ name: '', phone: '', email: '', joinedOn: todayIST(), dailyTarget: '80' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setErr(''); };

  async function save() {
    if (f.name.trim().length < 2) return setErr("Enter the BDE's full name.");
    if (f.phone.replace(/\D/g, '').length < 10) return setErr('Enter a 10-digit mobile number.');
    setBusy(true);
    try {
      const r = await api.users.create({ name: f.name.trim(), phone: f.phone, email: f.email.trim() || undefined, joinedOn: f.joinedOn, dailyTarget: Number(f.dailyTarget) || 80 });
      setF({ name: '', phone: '', email: '', joinedOn: todayIST(), dailyTarget: '80' });
      onAdded(r.user, r.temporaryPassword);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} title="Add BDE" onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy}>Create account</button></>}>
      <div className="form-grid">
        <label className="field">Full name<input className="input" value={f.name} onChange={set('name')} autoFocus /></label>
        <label className="field">Employee ID<input className="input" value={next.data?.employeeId ?? ''} readOnly /><span className="hint">Given automatically.</span></label>
        <label className="field">Mobile number<input className="input" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="98xxx xxxxx" /></label>
        <label className="field">Work email<input className="input" type="email" value={f.email} onChange={set('email')} placeholder="name@adz4needz.com" /></label>
        <label className="field">Joining date<input className="input" type="date" value={f.joinedOn} onChange={set('joinedOn')} /></label>
        <label className="field">Daily call target<input className="input" type="number" min={1} value={f.dailyTarget} onChange={set('dailyTarget')} /></label>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
    </Modal>
  );
}
