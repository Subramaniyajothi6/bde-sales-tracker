import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useLoad } from '../../lib/hooks';
import { CHECK_LABEL, PAYMENT_LABEL, fmtDate, rupee, short } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Loading } from '../../components/ui';

export default function Payments() {
  const promised = useLoad(() => api.payments.list('promised'));
  const received = useLoad(() => api.payments.list('received'));
  const s = promised.data?.summary;

  return (
    <>
      <section className="bde-head">
        <h1>My payments</h1>
        <div className="boxes">
          <div className="good"><span className="digits">{s ? short(s.collectedThisMonth) : '–'}</span><small>verified this month</small></div>
          <div><span className="digits">{s ? short(s.promisedAmount) : '–'}</span><small>promised, {s?.promisedCount ?? 0} candidate{s?.promisedCount === 1 ? '' : 's'}</small></div>
        </div>
      </section>
      <main className="bde-main">
        <Link className="btn block" to="/bde/payments/new" style={{ minHeight: 48 }}>Record payment</Link>
        <section className="sec">
          <div className="sec-head"><h2>Promised</h2></div>
          <div className="card-list">
            {promised.error ? <ErrorNote error={promised.error} onRetry={promised.reload} /> : !promised.data ? <Loading /> : promised.data.payments.map(p => (
              <Link className="list-row" key={p.id} to={`/bde/payments/new?lead=${p.lead.id}`}>
                <span className="grow-1"><b>{p.lead.name}</b><span className="sub">{p.lead.course}</span></span>
                <span className="end"><b>{rupee(p.amount)}</b><Due date={p.date} /></span>
              </Link>
            ))}
            {promised.data && !promised.data.payments.length && <Empty title="No promised payments" />}
          </div>
        </section>
        <section className="sec">
          <div className="sec-head"><h2>Received</h2></div>
          <div className="card-list">
            {received.error ? <ErrorNote error={received.error} onRetry={received.reload} /> : !received.data ? <Loading /> : received.data.payments.map(p => (
              <Link className="list-row" key={p.id} to={`/bde/leads/${p.lead.id}`}>
                <span className="grow-1"><b>{p.lead.name}</b>
                  <span className="sub" style={{ display: 'block' }}>{PAYMENT_LABEL[p.status]}, {fmtDate(p.date)}</span>
                  {p.rejectReason && <span className="sub" style={{ display: 'block', color: 'var(--red)' }}>{p.rejectReason}</span>}
                </span>
                <span className="end"><b>{rupee(p.amount)}</b>{p.check && <Badge label={CHECK_LABEL[p.check]} />}</span>
              </Link>
            ))}
            {received.data && !received.data.payments.length && <Empty title="No payments yet" />}
          </div>
        </section>
      </main>
    </>
  );
}
