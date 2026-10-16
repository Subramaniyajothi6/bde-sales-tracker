import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type ReportRow } from '../../api';
import { download, useLoad } from '../../lib/hooks';
import { REPORT_LABEL, addDays, fmtDate, int, monthName, rupee, short, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { SortTable, type Col } from '../../components/SortTable';

/**
 * One report for any period: calls and daily reports sent,
 * together with interviews, commitments, payments and revenue.
 * The dashboard opens it with ?period=month or ?show=not-started.
 */
type Period = 'day' | 'week' | 'month' | 'custom';

function rangeOf(period: Exclude<Period, 'custom'>, anchor: string) {
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

export default function Report() {
  const nav = useNavigate();
  const today = todayIST();
  const [params] = useSearchParams();
  const [period, setPeriod] = useState<Period>((['day', 'week', 'month', 'custom'] as Period[]).find(p => p === params.get('period')) ?? 'day');
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: addDays(today, -6), to: today });
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'not-sent' | 'not-started' | 'below'>((['not-sent', 'not-started', 'below'] as const).find(s => s === params.get('show')) ?? 'all');

  const r = period === 'custom'
    ? { ...custom, label: `${fmtDate(custom.from)} to ${fmtDate(custom.to)}` }
    : rangeOf(period, anchor);
  const valid = r.from <= r.to;
  const { data, error, reload } = useLoad(() => (valid ? api.reports.get(r.from, r.to) : Promise.resolve(null)), [r.from, r.to]);
  const oneDay = r.from === r.to;

  const rows = useMemo(() => (data?.rows ?? []).filter(x =>
    (!q || x.bde.name.toLowerCase().includes(q.toLowerCase()) || x.bde.employeeId.toLowerCase().includes(q.toLowerCase()))
    && (show === 'all'
      || (show === 'not-sent' && (oneDay ? x.report.status !== 'SENT' && x.report.status !== 'ON_LEAVE' : x.report.sentDays < x.report.dueDays))
      || (show === 'not-started' && x.calls === 0 && x.report.status !== 'ON_LEAVE')
      || (show === 'below' && x.calls < x.target))),
  [data, q, show, oneDay]);
  const t = data?.totals;
  const isNow = r.to >= today;

  const cols: Col<ReportRow>[] = [
    { label: 'BDE', cls: 'who', cell: x => <><b>{x.bde.name}</b>{x.report.note && <small className="report-note" title={x.report.note}>Note: {x.report.note}</small>}</> },
    { label: oneDay ? 'Report' : 'Reports sent', cell: x => oneDay
      ? <Badge label={REPORT_LABEL[x.report.status]} />
      : <span className={x.report.sentDays < x.report.dueDays ? 'warn-text' : 'ok-text'}>{x.report.sentDays} of {x.report.dueDays}</span> },
    { label: 'Calls', value: x => x.calls, cell: x => {
      const pc = Math.min(100, (x.calls / (x.target || 1)) * 100);
      return <span className="calls-cell"><b>{int(x.calls)}</b><span className="minibar"><i className={pc >= 100 ? 'done' : ''} style={{ width: `${pc}%` }} /></span><small className="muted">of {int(x.target)}</small></span>;
    } },
    { label: 'Interested', value: x => x.interested },
    { label: 'Interviews', value: x => x.interviewsAttended },
    { label: 'Committed', value: x => x.committed },
    { label: 'Paid', value: x => x.paid },
    { label: 'Revenue', value: x => x.revenue, cell: x => <b>{rupee(x.revenue)}</b> }
  ];

  return (
    <>
      <PageHead title="Reports" sub={data ? `${r.label}. ${data.days} working day${data.days === 1 ? '' : 's'} so far. Revenue counts verified payments only.` : r.label}
        tools={<>
          <div className="seg" role="group" aria-label="Period">
            {(['day', 'week', 'month', 'custom'] as Period[]).map(p =>
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
          </div>
          {period === 'custom' ? (
            <span className="range">
              <label className="sr-only" htmlFor="from">From</label>
              <input className="input" id="from" type="date" max={today} value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
              <span className="muted">to</span>
              <label className="sr-only" htmlFor="to">To</label>
              <input className="input" id="to" type="date" max={today} min={custom.from} value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
            </span>
          ) : (
            <span className="stepper-nav">
              <button type="button" className="btn ghost" aria-label="Previous" onClick={() => setAnchor(addDays(r.from, -1))}>‹</button>
              <strong>{r.label}</strong>
              <button type="button" className="btn ghost" aria-label="Next" disabled={isNow}
                onClick={() => { const n = addDays(r.to, period === 'week' ? 2 : 1); setAnchor(n > today ? today : n); }}>›</button>
            </span>
          )}
        </>}>
        {t && <StatStrip items={[
          { name: 'Calls', value: int(t.calls), sub: `of ${int(t.target)} target` },
          { name: 'Interested', value: int(t.interested), sub: t.calls ? `${Math.round((t.interested / t.calls) * 100)}% of calls` : undefined },
          { name: 'Interviews attended', value: int(t.interviewsAttended) },
          { name: 'Revenue', value: short(t.revenue), sub: `${t.paid} payment${t.paid === 1 ? '' : 's'}, ${t.committed} committed` }
        ]} />}
      </PageHead>
      <main className="wrap">
        <section className="panel">
          <div className="panel-head">
            <h2>{data ? `${rows.length} BDE${rows.length === 1 ? '' : 's'}` : 'BDEs'}</h2>
            <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn ghost" onClick={() => window.print()}>Download PDF</button>
              <button type="button" className="btn ghost" disabled={!valid} onClick={() => download(api.exports.report(r.from, r.to))}>Download Excel</button>
            </div>
          </div>
          <div className="toolbar">
            <label className="sr-only" htmlFor="q">Find a BDE</label>
            <input className="input search" id="q" type="search" placeholder="Find a BDE by name or ID" value={q} onChange={e => setQ(e.target.value)} />
            <label className="sr-only" htmlFor="show">Show</label>
            <select className="select" id="show" value={show} onChange={e => setShow(e.target.value as typeof show)}>
              <option value="all">Everyone</option><option value="not-sent">Report not sent</option><option value="not-started">No calls yet</option><option value="below">Below call target</option>
            </select>
          </div>
          {!valid ? <Empty title="Check the dates">The first date must be on or before the last date.</Empty>
            : error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : rows.length ? (
              <SortTable rows={rows} cols={cols} rowKey={x => x.bde.id} onRow={x => nav(`/admin/bde/${x.bde.id}`)} initialSort={7}
                footer={t && show === 'all' && !q ? (
                  <tr className="total"><td>Total</td><td>{oneDay ? `${t.reportsSent} sent` : ''}</td>
                    <td className="num">{int(t.calls)} <small className="muted">of {int(t.target)}</small></td>
                    <td className="num">{int(t.interested)}</td><td className="num">{t.interviewsAttended}</td>
                    <td className="num">{t.committed}</td><td className="num">{t.paid}</td><td className="num">{rupee(t.revenue)}</td></tr>
                ) : undefined} />
            ) : <Empty title="No BDEs match">Clear the search or change "Show".</Empty>}
        </section>
      </main>
    </>
  );
}
