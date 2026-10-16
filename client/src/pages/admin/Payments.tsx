import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Payment } from '../../api';
import { download, errorText, useLoad, useToast } from '../../lib/hooks';
import { CHECK_LABEL, PAYMENT_LABEL, fmtDate, rupee, short } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Icons, Loading, Modal, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { RECEIPTS_CHANGED } from '../../components/Shells';

type Tab = 'verify' | 'promised' | 'received';
const REASONS = ['Screenshot is unclear', "Amount doesn't match", 'Payment not received in bank', 'Wrong candidate'];

export default function Payments() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((['verify', 'promised', 'received'] as Tab[]).find(t => t === params.get('tab')) ?? 'verify');
  const { data, error, reload } = useLoad(() => api.payments.list(tab), [tab]);
  const [open, setOpen] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(p: Payment, fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      setOpen(null);
      window.dispatchEvent(new Event(RECEIPTS_CHANGED));
      await reload();
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }
  const verify = (p: Payment) => check(p, () => api.payments.verify(p.id), `${p.lead.name}: receipt verified`);
  const s = data?.summary;

  return (
    <>
      <PageHead title="Payments">
        {s && <StatStrip items={[
          { name: 'Collected this month', value: short(s.collectedThisMonth) },
          { name: 'To verify', value: s.toVerify },
          { name: 'Promised', value: s.promisedCount, sub: `${short(s.promisedAmount)} expected` }
        ]} />}
      </PageHead>
      <main className="wrap">
        <section className="panel">
          <div className="panel-head">
            <div className="seg" role="group" aria-label="Payments view">
              {([['verify', 'To verify'], ['promised', 'Promised'], ['received', 'All payments']] as [Tab, string][]).map(([k, l]) =>
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
            </div>
            <button type="button" className="btn ghost" onClick={() => download(api.exports.payments())}>Download Excel</button>
          </div>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : tab === 'verify' ? (
            data.payments.length ? (
              <div className="receipts">
                {data.payments.map(p => (
                  <article className="receipt" key={p.id}>
                    <button type="button" className="shot" onClick={() => setOpen(p)} aria-label={`View receipt for ${p.lead.name}`}>
                      {p.hasReceipt && p.receiptType?.startsWith('image/') ? <img src={api.payments.receiptUrl(p.id)} alt="" loading="lazy" /> : <>{Icons.image}{p.receiptName ?? 'No file'}</>}
                    </button>
                    <div className="info">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}><b>{p.lead.name}</b><span className="amt">{rupee(p.amount)}</span></div>
                      <span className="small muted">{p.lead.course}</span>
                      <span className="small muted">{p.owner.name}, {fmtDate(p.date)}</span>
                    </div>
                    <div className="acts">
                      <button type="button" className="btn ghost sm" onClick={() => setOpen(p)}>Review</button>
                      <button type="button" className="btn sm" disabled={busy} onClick={() => verify(p)}>Verify</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <Empty title="All receipts are verified" />
          ) : (
            <div className="scroll">
              <table className="data">
                <thead><tr><th scope="col">Candidate</th><th scope="col">BDE</th><th scope="col" className="num">Amount</th><th scope="col">{tab === 'promised' ? 'Promised for' : 'Paid on'}</th><th scope="col">Status</th><th scope="col">{tab === 'promised' ? 'Note' : 'Receipt'}</th></tr></thead>
                <tbody>
                  {data.payments.map(p => (
                    <tr key={p.id}>
                      <td className="who"><b>{p.lead.name}</b></td>
                      <td>{p.owner.name}</td>
                      <td className="num"><b>{rupee(p.amount)}</b></td>
                      <td>{tab === 'promised' ? <Due date={p.date} /> : fmtDate(p.date)}</td>
                      <td><Badge label={PAYMENT_LABEL[p.status]} /></td>
                      <td>{tab === 'promised' ? p.note ?? '' : <>{p.check && <Badge label={CHECK_LABEL[p.check]} />} <button type="button" className="linkbtn" onClick={() => setOpen(p)}>View</button></>}</td>
                    </tr>
                  ))}
                  {!data.payments.length && <tr><td colSpan={6}><Empty title="Nothing here yet" /></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <ReceiptDialog p={open} busy={busy} onClose={() => setOpen(null)} onVerify={verify}
        onReject={(p, reason) => check(p, () => api.payments.reject(p.id, reason), `${p.lead.name}: receipt rejected`)} />
    </>
  );
}

function ReceiptDialog({ p, busy, onClose, onVerify, onReject }: {
  p: Payment | null; busy: boolean; onClose: () => void; onVerify: (p: Payment) => void; onReject: (p: Payment, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const close = () => { setRejecting(false); onClose(); };
  const pending = p?.check === 'TO_VERIFY';
  const url = p?.hasReceipt ? api.payments.receiptUrl(p.id) : '';
  return (
    <Modal open={!!p} wide title={p ? `${p.lead.name}, ${rupee(p.amount)}` : 'Receipt'} onClose={close}
      footer={pending && p ? <>
        {rejecting
          ? <button type="button" className="btn danger" disabled={busy} onClick={() => { onReject(p, reason); setRejecting(false); }}>Confirm reject</button>
          : <button type="button" className="btn danger" onClick={() => setRejecting(true)}>Reject</button>}
        <button type="button" className="btn" disabled={busy} onClick={() => onVerify(p)}>Mark verified</button>
      </> : undefined}>
      {p && (
        <>
          <div className="row" style={{ gap: 20 }}>
            <div className="receipt-view">
              {!url ? <>{Icons.image}<span>No receipt file</span></>
                : p.receiptType === 'application/pdf' ? <iframe src={url} title="Receipt PDF" />
                : <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Receipt for ${p.lead.name}`} /></a>}
            </div>
            <div className="info-grid" style={{ flex: '1 1 260px', alignContent: 'start' }}>
              {([['Candidate', <>{p.lead.name}<br /><small className="muted">{p.lead.phone}</small></>], ['Course', <>{p.lead.course}<br /><small className="muted">Fee {rupee(p.lead.fee)}</small></>],
                ['Amount', <>{rupee(p.amount)} <Badge label={PAYMENT_LABEL[p.status]} /></>], ['Paid on', fmtDate(p.date, true)],
                ['Recorded by', p.recordedBy.name], ['Check', p.check ? <Badge label={CHECK_LABEL[p.check]} /> : '–'],
                ['BDE note', p.note ?? '–'], ...(p.rejectReason ? [['Reason', p.rejectReason] as const] : [])] as const)
                .map(([k, v]) => <div key={k}><div className="muted">{k}</div><div>{v}</div></div>)}
            </div>
          </div>
          {rejecting && (
            <label className="field">Why are you rejecting it?
              <select className="select" value={reason} onChange={e => setReason(e.target.value)}>{REASONS.map(r => <option key={r}>{r}</option>)}</select>
            </label>
          )}
        </>
      )}
    </Modal>
  );
}
