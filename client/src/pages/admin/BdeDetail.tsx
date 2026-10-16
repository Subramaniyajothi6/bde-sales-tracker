import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Stats } from '../../api';
import { useLoad } from '../../lib/hooks';
import { STAGE_LABEL, PAYMENT_LABEL, fmtDate, int, rupee, short } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { CallBars } from '../../components/CallBars';

const METRICS: [string, keyof Stats, (n: number) => string][] = [
  ['Calls', 'calls', int], ['Interested', 'interested', int], ['Interviews attended', 'attended', int],
  ['Committed', 'committed', int], ['Paid', 'paid', int], ['Revenue', 'revenue', short]
];

export default function BdeDetail() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const { data, error, reload } = useLoad(() => api.stats.bde(id), [id]);
  const bdes = useLoad(() => api.users.list({ status: 'all' }));
  const leads = useLoad(() => api.leads.list({ ownerId: id, view: 'active' }), [id]);
  const [vs, setVs] = useState('avg');
  const other = useLoad(() => (vs === 'avg' ? Promise.resolve(null) : api.stats.bde(Number(vs))), [vs]);

  if (error) return <main className="wrap"><ErrorNote error={error} onRetry={reload} /></main>;
  if (!data) return <main className="wrap"><Loading /></main>;
  const m = data.stats;
  const cmp = vs === 'avg' ? data.teamAverage : other.data?.stats;
  const cmpLabel = vs === 'avg' ? 'Team average' : other.data?.bde.name ?? '';

  return (
    <>
      <PageHead back={<Link to="/admin" className="no-print back">‹ Back</Link>} title={data.bde.name}
        sub={`${data.bde.employeeId}, ${data.bde.phone}.${data.rank ? ` Rank ${data.rank} of ${data.teamSize} this month.` : ''}`}
        tools={<>
          <label className="sr-only" htmlFor="pick">Switch BDE</label>
          <select className="select" id="pick" style={{ width: 'auto', minHeight: 40 }} value={id} onChange={e => nav(`/admin/bde/${e.target.value}`)}>
            {bdes.data?.users.map(b => <option key={b.id} value={b.id}>{b.name} ({b.employeeId})</option>)}
          </select>
        </>}>
        <StatStrip items={[
          { name: 'Calls', value: int(m?.calls ?? 0) }, { name: 'Interviews attended', value: m?.attended ?? 0 },
          { name: 'Paid', value: m?.paid ?? 0 }, { name: 'Revenue', value: short(m?.revenue ?? 0) }
        ]} />
      </PageHead>
      <main className="wrap">
        <section className="panel panel-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h2 className="h2">Calls each day</h2><span className="small muted">Target {data.bde.dailyTarget} a day</span>
          </div>
          <CallBars days={data.days} target={data.bde.dailyTarget} />
        </section>

        {m && cmp && (
          <section className="panel panel-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <h2 className="h2">Compared with</h2>
              <label className="sr-only" htmlFor="vs">Compare with</label>
              <select className="select" id="vs" style={{ width: 'auto' }} value={vs} onChange={e => setVs(e.target.value)}>
                <option value="avg">Team average</option>
                {bdes.data?.users.filter(b => b.id !== id).map(b => <option key={b.id} value={b.id}>{b.name} ({b.employeeId})</option>)}
              </select>
            </div>
            <div className="compare">
              <div className="c-row"><span /><span className="small" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: 'var(--primary)', verticalAlign: -1 }} /> {data.bde.name}</span>
                <span><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#9AA4B2', verticalAlign: -1 }} /> {cmpLabel}</span>
              </span></div>
              {METRICS.map(([label, k, fmt]) => {
                const a = m[k], o = cmp[k], mx = Math.max(a, o) || 1;
                const diff = o ? Math.round(((a - o) / o) * 100) : 0;
                return (
                  <div className="c-row" key={k}>
                    <span><b>{label}</b><br /><small style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>{diff >= 0 ? '+' : ''}{diff}% vs {vs === 'avg' ? 'average' : 'them'}</small></span>
                    <span className="c-bars">
                      <span className="c-bar a"><i style={{ width: `${(a / mx) * 70}%` }} />{fmt(a)}</span>
                      <span className="c-bar b"><i style={{ width: `${(o / mx) * 70}%` }} />{vs === 'avg' && o < 10 && k !== 'revenue' ? o.toFixed(1) : fmt(o)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="row">
          <section className="panel grow">
            <div className="panel-head"><h2>Follow-ups</h2></div>
            {!leads.data ? <Loading /> : leads.data.leads.filter(l => l.followUpOn).map(l => (
              <div className="list-row" key={l.id}>
                <span className="grow-1"><b>{l.name}</b><span className="sub">{l.nextAction}</span></span>
                <span className="end"><Badge label={STAGE_LABEL[l.stage]} /><Due date={l.followUpOn} /></span>
              </div>
            ))}
            {leads.data && !leads.data.leads.some(l => l.followUpOn) && <Empty title="No open follow-ups" />}
          </section>
          <PaymentsOf id={id} />
        </div>
      </main>
    </>
  );
}

function PaymentsOf({ id }: { id: number }) {
  const { data } = useLoad(() => api.payments.list('all'), [id]);
  const list = data?.payments.filter(p => p.owner.id === id).slice(0, 8);
  return (
    <section className="panel side">
      <div className="panel-head"><h2>Payments</h2></div>
      {!list ? <Loading /> : list.map(p => (
        <div className="list-row" key={p.id}>
          <span className="grow-1"><b>{p.lead.name}</b><span className="sub">{p.status === 'PROMISED' ? `Promised for ${fmtDate(p.date)}` : fmtDate(p.date)}</span></span>
          <span className="end"><b>{rupee(p.amount)}</b><Badge label={PAYMENT_LABEL[p.status]} /></span>
        </div>
      ))}
      {list && !list.length && <Empty title="No payments recorded" />}
    </section>
  );
}
