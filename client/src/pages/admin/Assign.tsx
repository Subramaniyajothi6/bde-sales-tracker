import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type BoardRow, type TodayAttendance } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { fmtDate, istDate, rupee } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

/**
 * Give students to the BDEs who perform well and have room. Pick which students
 * (from an import, or from one BDE), compare the BDEs' workload and results side by side,
 * tick who should get them, and they are shared out in turn (or each gets the number typed next to them).
 */
type Source = 'batch' | 'bde-open' | 'bde-overdue';

const TODAY_LABEL: Record<TodayAttendance, string> = { PRESENT: 'Present', LATE: 'Late', LEAVE: 'On leave', OFF: 'Off', NOT_IN: 'Not in yet' };
const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`);

type SortKey = 'suggested' | 'open' | 'overdue' | 'callsPerDay' | 'interestedRate' | 'interviewsAttended' | 'paid' | 'revenue' | 'onTarget';
const SORTS: Record<Exclude<SortKey, 'suggested'>, (r: BoardRow) => number> = {
  open: r => -r.load.open, overdue: r => -r.load.overdue, callsPerDay: r => r.month.callsPerDay,
  interestedRate: r => r.month.interestedRate, interviewsAttended: r => r.month.interviewsAttended,
  paid: r => r.month.paid, revenue: r => r.month.revenue, onTarget: r => (r.month.daysWorked ? r.month.daysOnTarget / r.month.daysWorked : 0)
};
/**
 * Suggested order: started today first, then not in yet, then on leave or off; within those the fewest overdue
 * follow-ups, then the most revenue, calls a day, interested % and calls today.
 */
const suggested = (a: BoardRow, b: BoardRow) => {
  const away = (r: BoardRow) => (r.today === 'PRESENT' || r.today === 'LATE' ? 0 : r.today === 'NOT_IN' ? 1 : 2);
  return away(a) - away(b) || a.load.overdue - b.load.overdue || b.month.revenue - a.month.revenue
    || b.month.callsPerDay - a.month.callsPerDay || b.month.interestedRate - a.month.interestedRate || b.callsToday - a.callsToday;
};

export default function Assign() {
  const toast = useToast();
  const board = useLoad(() => api.assign.board());
  const batches = useLoad(() => api.leads.batches());
  const [source, setSource] = useState<Source>('batch');
  const [batchId, setBatchId] = useState('');
  const [fromBde, setFromBde] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [sort, setSort] = useState<SortKey>('suggested');
  const [busy, setBusy] = useState(false);

  // The students that can be given out from the chosen source
  const pool = useLoad(() => {
    if (source === 'batch') return batchId ? api.leads.list({ view: 'all', batchId: Number(batchId), stage: 'NEW' }) : Promise.resolve(null);
    return fromBde ? api.leads.list({ view: source === 'bde-overdue' ? 'overdue' : 'active', ownerId: Number(fromBde) }) : Promise.resolve(null);
  }, [source, batchId, fromBde]);
  const available = pool.data?.leads ?? [];
  const count = available.length;

  const rows = useMemo(() => {
    const list = [...(board.data?.bdes ?? [])].filter(r => !(source !== 'batch' && String(r.bde.id) === fromBde));
    return sort === 'suggested' ? list.sort(suggested) : list.sort((a, b) => SORTS[sort](b) - SORTS[sort](a));
  }, [board.data, sort, source, fromBde]);
  const top = useMemo(() => [...rows].sort(suggested).filter(r => r.today !== 'LEAVE' && r.today !== 'OFF').slice(0, 3).map(r => r.bde.id), [rows]);
  const toggle = (id: number) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  // Optional number per ticked BDE. Any filled in = each BDE gets exactly their number; all blank = shared out evenly.
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const amountOf = (id: number) => Math.max(0, Math.floor(Number(amounts[id]) || 0));
  const manual = picked.some(id => amountOf(id) > 0);
  const manualTotal = picked.reduce((s, id) => s + amountOf(id), 0);
  const manualBlank = manual && picked.some(id => !amountOf(id));
  const manualTooMany = manual && manualTotal > available.length;
  const canGive = !busy && picked.length > 0 && (manual ? !manualBlank && !manualTooMany : count > 0);

  async function give() {
    if (!canGive) return;
    setBusy(true);
    try {
      let given: { name: string; count: number }[] = [];
      if (manual) {
        let from = 0;
        for (const id of picked) {
          const ids = available.slice(from, from + amountOf(id)).map(l => l.id);
          from += ids.length;
          const r = await api.assign.move(ids, [id]);
          given = given.concat(r.perBde.map(x => ({ name: x.bde.name, count: x.count })));
        }
      } else {
        const r = await api.assign.move(available.slice(0, count).map(l => l.id), picked);
        given = r.perBde.map(x => ({ name: x.bde.name, count: x.count }));
      }
      const total = given.reduce((s, x) => s + x.count, 0);
      toast(`${total} students given: ${given.map(x => `${x.name} ${x.count}`).join(', ')}`);
      setPicked([]); setAmounts({});
    } catch (e) { toast(errorText(e)); } finally {
      setBusy(false);
      await Promise.all([board.reload(), pool.reload(), batches.reload()]);
    }
  }

  const nameOf = (id: number) => rows.find(r => r.bde.id === id)?.bde.name ?? '';
  const footText = () => {
    if (!picked.length) return !count ? 'Choose which students first.' : 'Tick the BDEs who should get them.';
    if (manual) {
      if (manualBlank) return 'Type a number for every ticked BDE, or clear them all to share evenly.';
      if (manualTooMany) return <>That adds up to <b>{manualTotal}</b>, but only <b>{available.length}</b> students are available.</>;
      return <>Give {picked.map((id, i) => <span key={id}>{i ? ', ' : ''}{nameOf(id)} <b>{amountOf(id)}</b></span>)}: <b>{manualTotal}</b> students in all.</>;
    }
    if (!count) return 'Choose which students first.';
    return <>Give <b>{count}</b> student{count === 1 ? '' : 's'} to <b>{picked.length}</b> BDE{picked.length === 1 ? '' : 's'}: about <b>{Math.ceil(count / picked.length)}</b> each. Or type a number next to each BDE.</>;
  };

  const th = (label: string, key: SortKey, title?: string) => (
    <th scope="col" className="num" title={title}><button type="button" aria-sort={sort === key ? 'descending' : undefined} onClick={() => setSort(key)}>{label}</button></th>
  );

  return (
    <>
      <PageHead title="Assign leads" sub="Give students to the BDEs who are doing well and have room. Compare them below, tick who should get them, and type how many each gets or leave it to share them out evenly." />
      <main className="wrap">
        <section className="panel panel-pad assign-source">
          <h2 className="h2">1. Which students</h2>
          <div className="form-grid">
            <label className="field">From
              <select className="select" value={source} onChange={e => setSource(e.target.value as Source)}>
                <option value="batch">An import: students not called yet</option>
                <option value="bde-open">A BDE: their open leads</option>
                <option value="bde-overdue">A BDE: only their overdue follow-ups</option>
              </select>
            </label>
            {source === 'batch' ? (
              <label className="field">Import
                <select className="select" value={batchId} onChange={e => setBatchId(e.target.value)}>
                  <option value="">Choose an import…</option>
                  {batches.data?.batches.map(b => <option key={b.id} value={b.id}>{b.fileName}, {fmtDate(istDate(b.createdAt))} ({b.stages.NEW} not called)</option>)}
                </select>
              </label>
            ) : (
              <label className="field">BDE
                <select className="select" value={fromBde} onChange={e => setFromBde(e.target.value)}>
                  <option value="">Choose a BDE…</option>
                  {board.data?.bdes.map(r => <option key={r.bde.id} value={r.bde.id}>{r.bde.name}: {r.load.open} open, {r.load.overdue} overdue</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="hint">{pool.data ? <><b>{available.length}</b> student{available.length === 1 ? '' : 's'} available. Type how many each BDE gets below, or leave the boxes empty to share them all out evenly.</> : 'Choose where the students come from.'}</p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>2. Who should get them</h2>
            <div className="row-acts">
              <button type="button" className="btn ghost sm" onClick={() => setPicked(top)} disabled={!top.length}>Tick the suggested 3</button>
              {picked.length > 0 && <button type="button" className="linkbtn" onClick={() => setPicked([])}>Clear</button>}
            </div>
          </div>
          {board.error ? <ErrorNote error={board.error} onRetry={board.reload} /> : !board.data ? <Loading /> : (
            <div className="scroll">
              <table className="data assign-table">
                <thead>
                  <tr className="group-row">
                    <th scope="colgroup" colSpan={3} />
                    <th scope="colgroup" colSpan={3} className="grp">Workload now</th>
                    <th scope="colgroup" colSpan={6} className="grp">This month</th>
                  </tr>
                  <tr>
                    <th scope="col"><span className="sr-only">Pick</span></th>
                    <th scope="col"><button type="button" aria-sort={sort === 'suggested' ? 'descending' : undefined} onClick={() => setSort('suggested')}>BDE</button></th>
                    <th scope="col">Today</th>
                    {th('Open leads', 'open', 'Fewest first when sorted')}
                    {th('Overdue', 'overdue', 'Fewest first when sorted')}
                    <th scope="col" className="num">Not called</th>
                    {th('Calls a day', 'callsPerDay')}
                    {th('Interested', 'interestedRate', 'Share of calls that were interested')}
                    {th('Interviews', 'interviewsAttended', 'Interviews attended; % = how many came of those marked')}
                    {th('Paid', 'paid', 'Verified payments')}
                    {th('Revenue', 'revenue')}
                    {th('On target', 'onTarget', 'Days the call target was reached, of days worked')}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const on = picked.includes(r.bde.id);
                    const away = r.today === 'LEAVE' || r.today === 'OFF';
                    return (
                      <tr key={r.bde.id} className={`click${on ? ' picked' : ''}${away ? ' away' : ''}`} onClick={() => toggle(r.bde.id)}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={on} onChange={() => toggle(r.bde.id)} onClick={e => e.stopPropagation()} aria-label={`Give to ${r.bde.name}`} />
                          {on && (
                            <input className="input" type="number" min={1} placeholder="How many" value={amounts[r.bde.id] ?? ''}
                              style={{ width: 96, marginLeft: 8, padding: '4px 8px' }} aria-label={`How many for ${r.bde.name}`}
                              onClick={e => e.stopPropagation()} onChange={e => setAmounts(a => ({ ...a, [r.bde.id]: e.target.value }))} />
                          )}
                        </td>
                        <td className="who"><b><Link to={`/admin/bde/${r.bde.id}`} onClick={e => e.stopPropagation()}>{r.bde.name}</Link>{top.includes(r.bde.id) && sort === 'suggested' && <span className="role-tag">Suggested</span>}</b><small>{r.bde.employeeId}{picked.includes(r.bde.id) ? `, #${picked.indexOf(r.bde.id) + 1} to get leads` : ''}</small></td>
                        <td><Badge label={TODAY_LABEL[r.today]} /><small className="muted"> {r.callsToday} calls</small></td>
                        <td className="num"><b>{r.load.open}</b></td>
                        <td className="num">{r.load.overdue ? <span className="warn-text">{r.load.overdue}</span> : 0}</td>
                        <td className="num">{r.load.notCalled}</td>
                        <td className="num">{r.month.callsPerDay}</td>
                        <td className="num">{pct(r.month.interestedRate)}</td>
                        <td className="num">{r.month.interviewsAttended}<small className="muted"> {pct(r.month.showRate)}</small></td>
                        <td className="num">{r.month.paid}</td>
                        <td className="num"><b>{rupee(r.month.revenue)}</b></td>
                        <td className="num">{r.month.daysOnTarget}<small className="muted"> of {r.month.daysWorked}</small></td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={12}><Empty title="No active BDEs" /></td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-foot assign-foot">
            <span>{footText()}</span>
            <button type="button" className="btn" disabled={!canGive} onClick={give}>{busy ? 'Giving…' : 'Give the students'}</button>
          </div>
        </section>
      </main>
    </>
  );
}
