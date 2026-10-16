import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DayCell, type Leave, type UserRef } from '../../api';
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
  const [picked, setPicked] = useState<{ bde: UserRef; cell: DayCell } | null>(null);
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
        <DayDetails picked={picked} leaves={leaves.data?.leaves ?? []} onClose={() => setPicked(null)} />
        <section className="panel">
          <div className="panel-head">
            <h2>Each BDE, day by day</h2>
            <span className="legend small">
              {(['PRESENT', 'LATE', 'LEAVE', 'ABSENT'] as const).map(s => <span key={s}><i className={`d d-${s.toLowerCase()}`}>{DAY_LABEL[s][1]}</i>{DAY_LABEL[s][0]}</span>)}
            </span>
          </div>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
            // Its own scroll box, so the date row stays on top and names stay on the left while scrolling
            <div className="scroll att-scroll">
              <table className="data att-grid">
                <thead><tr>
                  <th scope="col" className="sticky">BDE</th>
                  {data.dates.map(d => {
                    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                    return <th key={d} scope="col" className={`day${d === todayIST() ? ' today' : ''}${dow === 0 ? ' sun' : ''}`} title={fmtDate(d, true)}>{Number(d.slice(8))}<small>{'SMTWTFS'[dow]}</small></th>;
                  })}
                  <th scope="col" className="num">Present</th><th scope="col" className="num">Late</th><th scope="col" className="num">Leave</th><th scope="col" className="num">Absent</th>
                </tr></thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.bde.id}>
                      <td className="who sticky"><Link to={`/admin/bde/${r.bde.id}`}><b>{r.bde.name}</b></Link></td>
                      {r.cells.map(c => <td key={c.date} className="day"><DayButton cell={c} onOpen={() => setPicked({ bde: r.bde, cell: c })} /></td>)}
                      <td className="num"><b>{r.totals.present}</b></td><td className="num">{r.totals.late}</td>
                      <td className="num">{r.totals.leave}</td><td className="num">{r.totals.absent || <span className="muted">0</span>}</td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={data.dates.length + 5}><Empty title="No BDEs yet" /></td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-foot"><span>Tap a day (or press and hold) to see start and finish times. A day with calls but no "Start my day" tap still counts as present.</span></div>
        </section>
      </main>
    </>
  );
}

/** One day square. Opens the details on a tap or click, or after pressing and holding for half a second. */
function DayButton({ cell, onOpen }: { cell: DayCell; onOpen: () => void }) {
  const timer = useRef<number>();
  const held = useRef(false);
  const stop = () => window.clearTimeout(timer.current);
  return (
    <button type="button" className="day-btn" title={cellTitle(cell)} aria-label={cellTitle(cell)}
      onPointerDown={() => { held.current = false; stop(); timer.current = window.setTimeout(() => { held.current = true; onOpen(); }, 500); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      // On touch screens a long press arrives as the browser's own "context menu" signal
      onContextMenu={e => { e.preventDefault(); stop(); held.current = true; onOpen(); }}
      onClick={() => { stop(); if (!held.current) onOpen(); held.current = false; }}>
      <i className={`d d-${cell.status.toLowerCase().replace('_', '-')}`}>{DAY_LABEL[cell.status][1]}</i>
    </button>
  );
}

/** Details of one BDE's day: status, start and finish, hours, and the leave if they were on leave. */
function DayDetails({ picked, leaves, onClose }: { picked: { bde: UserRef; cell: DayCell } | null; leaves: Leave[]; onClose: () => void }) {
  const c = picked?.cell;
  const leave = c && leaves.find(l => l.user.id === picked!.bde.id && l.status === 'APPROVED' && l.from <= c.date && c.date <= l.to);
  const rows: [string, React.ReactNode][] = c ? [
    ['Started', c.punchIn ? fmtTime(c.punchIn) : '–'],
    ['Finished', c.punchOut ? fmtTime(c.punchOut) : c.punchIn ? 'Report not sent yet' : '–'],
    ['Hours', c.hours ? `${c.hours} h` : '–'],
    ...(leave ? [['Leave', `${LEAVE_TYPE_LABEL[leave.type]}: ${leave.reason}`] as [string, React.ReactNode]] : [])
  ] : [];
  return (
    <Modal open={!!picked} title={picked ? `${picked.bde.name}, ${fmtDate(picked.cell.date, true)}` : 'Day'} onClose={onClose}
      footer={picked && <><Link className="btn ghost" to={`/admin/bde/${picked.bde.id}`}>Open {picked.bde.name.split(' ')[0]}'s page</Link><button type="button" className="btn" onClick={onClose}>Done</button></>}>
      {c && <>
        <div className="day-detail-status"><i className={`d d-${c.status.toLowerCase().replace('_', '-')}`}>{DAY_LABEL[c.status][1] || '–'}</i><b>{DAY_LABEL[c.status][0] || 'Upcoming day'}</b></div>
        <dl className="facts">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {c.status === 'PRESENT' && !c.punchIn && <p className="small muted">Counted as present because calls were logged that day, without a "Start my day" tap.</p>}
      </>}
    </Modal>
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
