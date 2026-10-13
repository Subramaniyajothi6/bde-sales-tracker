import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DayCell, type Leave } from '../../api';
import { download, errorText, useLoad, useToast } from '../../lib/hooks';
import { DAY_LABEL, LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, fmtClock, fmtDate, fmtTime, monthName, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, Modal, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

/** Fired after a leave request is answered, so the menu count updates. */
export const LEAVES_CHANGED = 'leaves-changed';

function recentMonths() {
  const out: string[] = [];
  const d = new Date(`${todayIST().slice(0, 7)}-01T00:00:00Z`);
  for (let i = 0; i < 12; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); }
  return out;
}

const cellTitle = (c: DayCell) => [
  fmtDate(c.date, true), DAY_LABEL[c.status][0],
  c.punchIn && `in ${fmtTime(c.punchIn)}`, c.punchOut && `out ${fmtTime(c.punchOut)}`, c.hours && `${c.hours} h`
].filter(Boolean).join(', ');

export default function Attendance() {
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const { data, error, reload } = useLoad(() => api.attendance.month(month), [month]);
  const leaves = useLoad(() => api.leaves.list());
  const t = data?.today;
  const reloadAll = () => { void reload(); void leaves.reload(); window.dispatchEvent(new Event(LEAVES_CHANGED)); };

  return (
    <>
      <PageHead title="Attendance" sub={data ? `${monthName(month)}. Late means starting after ${fmtClock(data.lateAfter)}.` : undefined} tools={<>
        <label className="sr-only" htmlFor="month">Month</label>
        <select className="select" id="month" style={{ width: 'auto', minHeight: 40 }} value={month} onChange={e => setMonth(e.target.value)}>
          {recentMonths().map(m => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        <button type="button" className="btn ghost" onClick={() => download(api.exports.attendance(month))}>Download Excel</button>
      </>}>
        {t && data && <StatStrip items={[
          { name: 'Present today', value: `${t.present} of ${data.rows.length}` },
          { name: 'Late today', value: t.late },
          { name: 'On leave today', value: t.onLeave },
          { name: 'Not in yet', value: t.notIn }
        ]} />}
      </PageHead>
      <main className="wrap">
        <LeaveRequests list={leaves.data?.leaves ?? null} error={leaves.error} onChanged={reloadAll} />
        <section className="panel">
          <div className="panel-head">
            <h2>Each BDE, day by day</h2>
            <span className="legend small">
              {(['PRESENT', 'LATE', 'LEAVE', 'ABSENT'] as const).map(s => <span key={s}><i className={`d d-${s.toLowerCase()}`}>{DAY_LABEL[s][1]}</i>{DAY_LABEL[s][0]}</span>)}
            </span>
          </div>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
            <div className="scroll">
              <table className="data att-grid">
                <thead><tr>
                  <th scope="col" className="sticky">BDE</th>
                  {data.dates.map(d => <th key={d} scope="col" className={`day${d === todayIST() ? ' today' : ''}`} title={fmtDate(d, true)}>{Number(d.slice(8))}</th>)}
                  <th scope="col" className="num">Present</th><th scope="col" className="num">Late</th><th scope="col" className="num">Leave</th><th scope="col" className="num">Absent</th>
                </tr></thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.bde.id}>
                      <td className="who sticky"><Link to={`/admin/bde/${r.bde.id}`}><b>{r.bde.name}</b></Link></td>
                      {r.cells.map(c => <td key={c.date} className="day" title={cellTitle(c)}><i className={`d d-${c.status.toLowerCase().replace('_', '-')}`}>{DAY_LABEL[c.status][1]}</i></td>)}
                      <td className="num"><b>{r.totals.present}</b></td><td className="num">{r.totals.late}</td>
                      <td className="num">{r.totals.leave}</td><td className="num">{r.totals.absent || <span className="muted">0</span>}</td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={data.dates.length + 5}><Empty title="No BDEs yet" /></td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-foot"><span>Hover over a day to see start and finish times. A day with calls but no "Start my day" tap still counts as present.</span></div>
        </section>
      </main>
    </>
  );
}

function LeaveRequests({ list, error, onChanged }: { list: Leave[] | null; error: string | null; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Leave | null>(null);
  const [showAll, setShowAll] = useState(false);
  const pending = list?.filter(l => l.status === 'PENDING') ?? [];
  const answered = list?.filter(l => l.status !== 'PENDING') ?? [];

  async function approve(l: Leave) {
    setBusy(true);
    try { await api.leaves.approve(l.id); toast(`${l.user.name}: leave approved`); onChanged(); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }
  const row = (l: Leave, actions: boolean) => (
    <div className="list-row" key={l.id}>
      <span className="grow-1">
        <b>{l.user.name} <span className="muted" style={{ fontWeight: 400 }}>{l.from === l.to ? fmtDate(l.from, true) : `${fmtDate(l.from)} to ${fmtDate(l.to)}`}, {l.days} day{l.days === 1 ? '' : 's'}</span></b>
        <span className="sub" style={{ display: 'block' }}>{LEAVE_TYPE_LABEL[l.type]}: {l.reason}{l.decisionNote ? `. Answer: ${l.decisionNote}` : ''}</span>
      </span>
      {actions ? (
        <span className="row-acts">
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setRejecting(l)}>Reject</button>
          <button type="button" className="btn sm" disabled={busy} onClick={() => approve(l)}>Approve</button>
        </span>
      ) : <Badge label={LEAVE_STATUS_LABEL[l.status]} />}
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Leave requests {pending.length > 0 && <span className="count-pill">{pending.length} waiting</span>}</h2>
        {answered.length > 0 && <button type="button" className="linkbtn" onClick={() => setShowAll(s => !s)}>{showAll ? 'Hide answered' : 'Show answered'}</button>}
      </div>
      {error ? <ErrorNote error={error} /> : !list ? <Loading /> : <>
        {pending.map(l => row(l, true))}
        {!pending.length && <Empty title="No leave requests waiting" />}
        {showAll && answered.slice(0, 30).map(l => row(l, false))}
      </>}
      <RejectLeave leave={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); onChanged(); }} />
    </section>
  );
}

function RejectLeave({ leave, onClose, onDone }: { leave: Leave | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!leave) return;
    if (note.trim().length < 3) return setErr('Say why, so the BDE knows.');
    setBusy(true);
    try { await api.leaves.reject(leave.id, note.trim()); toast(`${leave.user.name}: leave rejected`); setNote(''); onDone(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!leave} title={leave ? `Reject ${leave.user.name}'s leave` : 'Reject leave'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn danger" disabled={busy}>Reject leave</button></>}>
      <label className="field">Reason the BDE will see
        <input className="input" value={note} onChange={e => { setNote(e.target.value); setErr(''); }} placeholder="e.g. Month-end targets, please choose another date" autoFocus />
      </label>
      {err && <span className="err" role="alert">{err}</span>}
    </Modal>
  );
}
