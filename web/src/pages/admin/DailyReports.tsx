import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { download, useLoad } from '../../lib/hooks';
import { REPORT_LABEL, addDays, fmtDate, int, monthName, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

type Period = 'day' | 'week' | 'month';

function rangeOf(period: Period, anchor: string) {
  if (period === 'day') return { from: anchor, to: anchor, label: anchor === todayIST() ? `Today, ${fmtDate(anchor)}` : fmtDate(anchor, true) };
  if (period === 'week') {
    const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7;
    const mon = addDays(anchor, -dow), sat = addDays(mon, 5);
    return { from: mon, to: sat, label: `${fmtDate(mon)} to ${fmtDate(sat)}` };
  }
  const m = anchor.slice(0, 7);
  const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}`, label: monthName(m) };
}

export default function DailyReports() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(todayIST());
  const [q, setQ] = useState('');
  const [show, setShow] = useState(params.get('show') === 'missing' ? 'missing' : 'all');
  const r = rangeOf(period, anchor);
  const { data, error, reload } = useLoad(() => api.dailyReports.list(r.from, r.to), [r.from, r.to]);

  const rows = useMemo(() => (data?.rows ?? []).filter(x =>
    (!q || x.bde.name.toLowerCase().includes(q.toLowerCase()) || x.bde.employeeId.toLowerCase().includes(q.toLowerCase()))
    && (show === 'all' || (show === 'missing' ? x.status !== 'SENT' : x.total < x.target))), [data, q, show]);
  const all = data?.rows ?? [];
  const sum = (k: 'INTERESTED' | 'CALL_BACK' | 'NOT_INTERESTED' | 'NO_ANSWER') => rows.reduce((t, x) => t + x.counts[k], 0);
  const isNow = r.to >= todayIST();

  return (
    <>
      <PageHead title="Daily reports" tools={<>
        <div className="seg" role="group" aria-label="Period">
          {(['day', 'week', 'month'] as Period[]).map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
        </div>
        <button type="button" className="btn ghost" aria-label="Previous" onClick={() => setAnchor(addDays(r.from, -1))}>‹</button>
        <strong style={{ minWidth: 150, textAlign: 'center' }}>{r.label}</strong>
        <button type="button" className="btn ghost" aria-label="Next" disabled={isNow} onClick={() => { const n = addDays(r.to, period === 'week' ? 2 : 1); setAnchor(n > todayIST() ? todayIST() : n); }}>›</button>
      </>}>
        {data && <StatStrip items={[
          { name: 'Calls', value: int(all.reduce((t, x) => t + x.total, 0)), sub: `of ${int(all.reduce((t, x) => t + x.target, 0))} target` },
          { name: 'Interested', value: int(all.reduce((t, x) => t + x.counts.INTERESTED, 0)) },
          { name: 'Reports sent', value: `${all.filter(x => x.status === 'SENT').length} of ${all.length}`, sub: period === 'day' && anchor === todayIST() ? 'due by 7:30 pm' : undefined }
        ]} />}
      </PageHead>
      <main className="wrap">
        <section className="panel">
          <div className="panel-head">
            <h2>{rows.length} BDEs</h2>
            <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn ghost" onClick={() => window.print()}>Download PDF</button>
              <button type="button" className="btn ghost" onClick={() => download(api.exports.daily(r.from, r.to))}>Download Excel</button>
            </div>
          </div>
          <div className="toolbar">
            <label className="sr-only" htmlFor="q">Find a BDE</label>
            <input className="input search" id="q" type="search" placeholder="Find a BDE by name or ID" value={q} onChange={e => setQ(e.target.value)} />
            <label className="sr-only" htmlFor="show">Show</label>
            <select className="select" id="show" value={show} onChange={e => setShow(e.target.value)}>
              <option value="all">Everyone</option><option value="missing">Not sent</option><option value="below">Below target</option>
            </select>
          </div>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
            <div className="scroll">
              <table className="data">
                <thead><tr>
                  <th scope="col">BDE</th><th scope="col">Status</th>
                  <th scope="col" className="num">Interested</th><th scope="col" className="num">Call back</th>
                  <th scope="col" className="num">Not interested</th><th scope="col" className="num">No answer</th>
                  <th scope="col" className="num">Total</th><th scope="col" style={{ minWidth: 140 }}>Target</th>
                </tr></thead>
                <tbody>
                  {rows.map(x => {
                    const p = Math.min(100, (x.total / (x.target || 1)) * 100);
                    return (
                      <tr key={x.bde.id} className="click" tabIndex={0} onClick={() => nav(`/admin/bde/${x.bde.id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/admin/bde/${x.bde.id}`); }}>
                        <td className="who"><b>{x.bde.name}</b></td>
                        <td><Badge label={REPORT_LABEL[x.status]} />{period !== 'day' && <small className="muted"> {x.sentDays}/{x.dueDays}</small>}</td>
                        <td className="num">{x.counts.INTERESTED}</td><td className="num">{x.counts.CALL_BACK}</td>
                        <td className="num">{x.counts.NOT_INTERESTED}</td><td className="num">{x.counts.NO_ANSWER}</td>
                        <td className="num"><b>{x.total}</b></td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="minibar" style={{ flex: 1 }}><i className={p >= 100 ? 'done' : ''} style={{ width: `${p}%` }} /></div><small className="muted">{x.total}/{x.target}</small></div></td>
                      </tr>
                    );
                  })}
                  {rows.length > 0 && (
                    <tr className="total"><td>Total</td><td />
                      <td className="num">{sum('INTERESTED')}</td><td className="num">{sum('CALL_BACK')}</td><td className="num">{sum('NOT_INTERESTED')}</td><td className="num">{sum('NO_ANSWER')}</td>
                      <td className="num">{int(rows.reduce((t, x) => t + x.total, 0))}</td><td /></tr>
                  )}
                  {!rows.length && <tr><td colSpan={8}><Empty title="No BDEs match">Clear the search or change "Show" to see everyone.</Empty></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
