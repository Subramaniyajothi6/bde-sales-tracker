import { useState } from 'react';
import { api, type LeaveType } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, addDays, fmtDate, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, Modal } from '../../components/ui';

/** "Leave" on the BDE's Me tab: ask for leave and see the answers. */
export function LeaveSection() {
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.leaves.list());
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayIST();

  async function cancel(id: number) {
    setBusy(true);
    try { await api.leaves.cancel(id); toast('Leave request cancelled'); await reload(); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Leave</h2><button type="button" className="btn ghost" onClick={() => setAsking(true)}>Ask for leave</button></div>
      <div>
        {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : data.leaves.slice(0, 10).map(l => (
          <div className="list-row" key={l.id}>
            <span className="grow-1">
              <b>{l.from === l.to ? fmtDate(l.from, true) : `${fmtDate(l.from)} to ${fmtDate(l.to)}`}</b>
              <span className="sub" style={{ display: 'block' }}>{LEAVE_TYPE_LABEL[l.type]}, {l.days} day{l.days === 1 ? '' : 's'}. {l.reason}</span>
              {l.decisionNote && <span className="sub" style={{ display: 'block', color: l.status === 'REJECTED' ? 'var(--red)' : undefined }}>Admin: {l.decisionNote}</span>}
            </span>
            <span className="end">
              <Badge label={LEAVE_STATUS_LABEL[l.status]} />
              {(l.status === 'PENDING' || (l.status === 'APPROVED' && l.from > today)) &&
                <button type="button" className="linkbtn" disabled={busy} onClick={() => cancel(l.id)}>Cancel</button>}
            </span>
          </div>
        ))}
        {data && !data.leaves.length && <Empty title="No leave requests">Tap "Ask for leave" when you need a day off.</Empty>}
      </div>
      <AskLeave open={asking} onClose={() => setAsking(false)} onDone={() => { setAsking(false); void reload(); }} />
    </section>
  );
}

function AskLeave({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const tomorrow = addDays(todayIST(), 1);
  const [f, setF] = useState({ type: 'CASUAL' as LeaveType, from: tomorrow, to: tomorrow, reason: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    // Moving the first day past the last day moves the last day too
    setF(p => ({ ...p, [k]: v, ...(k === 'from' && v > p.to ? { to: v } : {}) }));
    setErr('');
  };

  async function save() {
    if (f.reason.trim().length < 3) return setErr('Say why you need leave.');
    setBusy(true);
    try {
      await api.leaves.request({ ...f, reason: f.reason.trim() });
      toast('Leave request sent to your admin');
      setF({ type: 'CASUAL', from: tomorrow, to: tomorrow, reason: '' });
      onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} title="Ask for leave" onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy}>Send request</button></>}>
      <label className="field">Type of leave
        <select className="select" value={f.type} onChange={set('type')}>
          {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map(t => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <label className="field">First day<input className="input" type="date" min={addDays(todayIST(), -7)} value={f.from} onChange={set('from')} /></label>
        <label className="field">Last day<input className="input" type="date" min={f.from} value={f.to} onChange={set('to')} /></label>
      </div>
      <label className="field">Reason<textarea className="textarea" rows={3} maxLength={300} value={f.reason} onChange={set('reason')} placeholder="e.g. Family function in my home town" /></label>
      {err && <span className="err" role="alert">{err}</span>}
    </Modal>
  );
}
