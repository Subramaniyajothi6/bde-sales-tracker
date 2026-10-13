import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useLoad } from '../../lib/hooks';
import { CHECK_LABEL, PAYMENT_LABEL, fmtDate, rupee, short } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

export default function Payments() {
  const nav = useNavigate();
  const promised = useLoad(() => api.payments.list('promised'));
  const received = useLoad(() => api.payments.list('received'));
  const s = promised.data?.summary;
  const rToVerify = received.data?.payments.filter(p => p.check === 'TO_VERIFY').length ?? 0;

  return (
    <>
      <PageHead title="My payments" tools={<Link className="btn" to="/bde/payments/new">Record payment</Link>}>
        {s && <StatStrip items={[
          { name: 'Verified this month', value: short(s.collectedThisMonth), sub: 'counts as your revenue' },
          { name: 'Promised', value: short(s.promisedAmount), sub: `${s.promisedCount} candidate${s.promisedCount === 1 ? '' : 's'}` },
          { name: 'Waiting for admin', value: rToVerify, sub: 'receipts not checked yet' }
        ]} />}
      </PageHead>
      <main className="wrap">
        <div className="row">
          <section className="panel grow">
            <div className="panel-head"><h2>Received</h2></div>
            {received.error ? <ErrorNote error={received.error} onRetry={received.reload} /> : !received.data ? <Loading /> : (
              <div className="scroll">
                <table className="data stack">
                  <thead><tr><th scope="col">Candidate</th><th scope="col" className="num">Amount</th><th scope="col">Paid on</th><th scope="col">Receipt</th></tr></thead>
                  <tbody>
                    {received.data.payments.map(p => (
                      <tr key={p.id} className="click" tabIndex={0} onClick={() => nav(`/bde/leads/${p.lead.id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/bde/leads/${p.lead.id}`); }}>
                        <td className="who" data-label="Candidate"><b>{p.lead.name}</b><small>{p.lead.course}, {PAYMENT_LABEL[p.status].toLowerCase()}</small></td>
                        <td className="num" data-label="Amount"><b>{rupee(p.amount)}</b></td>
                        <td data-label="Paid on">{fmtDate(p.date)}</td>
                        <td data-label="Receipt">{p.check && <Badge label={CHECK_LABEL[p.check]} />}{p.rejectReason && <small className="reject-why">{p.rejectReason}. Record it again with a new receipt.</small>}</td>
                      </tr>
                    ))}
                    {!received.data.payments.length && <tr><td colSpan={4}><Empty title="No payments yet" /></td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel side">
            <div className="panel-head"><h2>Promised</h2></div>
            {promised.error ? <ErrorNote error={promised.error} onRetry={promised.reload} /> : !promised.data ? <Loading /> : promised.data.payments.map(p => (
              <Link className="list-row" key={p.id} to={`/bde/payments/new?lead=${p.lead.id}`}>
                <span className="grow-1"><b>{p.lead.name}</b><span className="sub">{p.lead.course}</span></span>
                <span className="end"><b>{rupee(p.amount)}</b><Due date={p.date} /></span>
              </Link>
            ))}
            {promised.data && !promised.data.payments.length && <Empty title="No promised payments" />}
          </section>
        </div>
      </main>
    </>
  );
}
