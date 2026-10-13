import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useLoad } from '../../lib/hooks';
import { fmtDate, int, rupee } from '../../lib/format';
import { Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { SortTable } from '../../components/SortTable';

export default function Dashboard() {
  const nav = useNavigate();
  const { data, error, reload } = useLoad(() => api.stats.dashboard());
  if (error) return <main className="wrap"><ErrorNote error={error} onRetry={reload} /></main>;
  if (!data) return <main className="wrap"><Loading /></main>;
  const t = data.today;
  const todo = ([
    [data.todo.receiptsToVerify, 'receipts to verify', '/admin/payments'],
    [data.todo.leavesToApprove, 'leave requests to answer', '/admin/attendance'],
    [data.todo.notStarted, "BDEs haven't started calling", '/admin/daily-reports?show=not-started'],
    [data.todo.overdueFollowUps, 'follow-ups overdue', '/admin/leads?view=overdue'],
    [data.todo.interviewsToMark, 'interviews not marked', '/admin/interviews']
  ] as const).filter(([n]) => n > 0);

  return (
    <>
      <PageHead title="Dashboard" sub={fmtDate(data.date, true)}>
        <StatStrip items={[
          { name: 'Calls today', value: int(t.calls), sub: `of ${int(t.target)} team target` },
          { name: 'Interested today', value: int(t.interested), sub: `from ${int(t.calls)} calls` },
          { name: 'Interviews today', value: `${t.interviews.attended} of ${t.interviews.total}`, sub: 'attended so far' },
          { name: 'Collected today', value: rupee(t.collected.amount), sub: `${t.collected.count} payment${t.collected.count === 1 ? '' : 's'}, incl. unverified` }
        ]} />
      </PageHead>
      <main className="wrap">
        <div className="row">
          <section className="panel grow">
            <div className="panel-head"><h2>Each BDE, this month</h2><Link className="btn ghost sm" to="/admin/reports">Full report</Link></div>
            <SortTable
              rows={data.month.rows}
              rowKey={r => r.bde.id}
              onRow={r => nav(`/admin/bde/${r.bde.id}`)}
              initialSort={5}
              cols={[
                { label: 'BDE', cell: r => <span className="who"><b>{r.bde.name}</b></span>, cls: 'who' },
                { label: 'Calls', value: r => r.stats.calls, cell: r => int(r.stats.calls) },
                { label: 'Interested', value: r => r.stats.interested },
                { label: 'Interviews', value: r => r.stats.attended },
                { label: 'Paid', value: r => r.stats.paid },
                { label: 'Revenue', value: r => r.stats.revenue, cell: r => <b>{rupee(r.stats.revenue)}</b> }
              ]}
            />
          </section>
          <aside className="side">
            <section className="panel">
              <div className="panel-head"><h2>To do</h2></div>
              {todo.map(([n, label, to]) => (
                <Link className="list-row" to={to} key={label}><span className="count">{n}</span><span className="grow-1">{label}</span><span aria-hidden="true" className="muted">›</span></Link>
              ))}
              {!todo.length && <Empty title="Nothing to do">Everything is up to date.</Empty>}
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
