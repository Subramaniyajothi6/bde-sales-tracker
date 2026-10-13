import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { download, useLoad } from '../../lib/hooks';
import { addDays, fmtDate, int, monthName, rupee, short, todayIST } from '../../lib/format';
import { ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { SortTable } from '../../components/SortTable';

/** Last 12 months, newest first, as YYYY-MM. */
function recentMonths() {
  const out: string[] = [];
  const d = new Date(`${todayIST().slice(0, 7)}-01T00:00:00Z`);
  for (let i = 0; i < 12; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); }
  return out;
}

export default function Reports() {
  const nav = useNavigate();
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const { data, error, reload } = useLoad(() => api.stats.monthly(month), [month]);
  const t = data?.totals;
  const today = todayIST();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weekFrom = addDays(today, -dow);

  return (
    <>
      <PageHead title="Monthly report" sub={data ? `${fmtDate(data.from)} to ${fmtDate(data.to)} ${data.to.slice(0, 4)}` : undefined} tools={<>
        <label className="sr-only" htmlFor="month">Month</label>
        <select className="select" id="month" style={{ width: 'auto', minHeight: 40 }} value={month} onChange={e => setMonth(e.target.value)}>
          {recentMonths().map(m => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        <button type="button" className="btn ghost" onClick={() => window.print()}>PDF</button>
        <button type="button" className="btn" onClick={() => download(api.exports.monthly(month))}>Excel</button>
      </>}>
        {t && <StatStrip items={[
          { name: 'Calls', value: int(t.calls) }, { name: 'Interviews attended', value: int(t.attended) },
          { name: 'Payments', value: int(t.paid) }, { name: 'Revenue', value: short(t.revenue) }
        ]} />}
      </PageHead>
      <main className="wrap">
        <div className="row">
          <section className="panel grow">
            <div className="panel-head"><h2>Each BDE</h2></div>
            {error ? <ErrorNote error={error} onRetry={reload} /> : !data || !t ? <Loading /> : (
              <SortTable rows={data.rows} rowKey={r => r.bde.id} onRow={r => nav(`/admin/bde/${r.bde.id}`)} initialSort={6}
                cols={[
                  { label: 'BDE', cell: r => <b>{r.bde.name}</b>, cls: 'who' },
                  { label: 'Calls', value: r => r.stats.calls, cell: r => int(r.stats.calls) },
                  { label: 'Interested', value: r => r.stats.interested },
                  { label: 'Interviews', value: r => r.stats.attended },
                  { label: 'Committed', value: r => r.stats.committed },
                  { label: 'Paid', value: r => r.stats.paid },
                  { label: 'Revenue', value: r => r.stats.revenue, cell: r => <b>{rupee(r.stats.revenue)}</b> }
                ]}
                footer={<tr className="total"><td>Total</td><td className="num">{int(t.calls)}</td><td className="num">{int(t.interested)}</td><td className="num">{t.attended}</td><td className="num">{t.committed}</td><td className="num">{t.paid}</td><td className="num">{rupee(t.revenue)}</td></tr>}
              />
            )}
          </section>
          <aside className="side no-print">
            <section className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 className="h3">Other downloads</h3>
              <button type="button" className="btn ghost block" onClick={() => download(api.exports.daily(today))}>Today's daily report</button>
              <button type="button" className="btn ghost block" onClick={() => download(api.exports.daily(weekFrom, today))}>This week's report</button>
              <button type="button" className="btn ghost block" onClick={() => download(api.exports.leads())}>All leads with status</button>
              <button type="button" className="btn ghost block" onClick={() => download(api.exports.payments())}>All payments and receipts</button>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
