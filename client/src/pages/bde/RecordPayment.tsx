import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type PaymentStatus } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { addDays, rupee, todayIST } from '../../lib/format';
import { Icons, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

const LABEL: Record<PaymentStatus, string> = { PROMISED: 'Promised', PARTIALLY_PAID: 'Part paid', PAID: 'Paid in full' };

export default function RecordPayment() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const leads = useLoad(() => api.leads.list({ view: 'all' }));
  const options = useMemo(() => (leads.data?.leads ?? [])
    .filter(l => l.stage !== 'NOT_INTERESTED')
    .sort((a, b) => ['PAYMENT_COMMITTED', 'SELECTED', 'PAID'].indexOf(b.stage) - ['PAYMENT_COMMITTED', 'SELECTED', 'PAID'].indexOf(a.stage)), [leads.data]);

  const [leadId, setLeadId] = useState<number | null>(params.get('lead') ? Number(params.get('lead')) : null);
  useEffect(() => { if (!leadId && options.length) setLeadId(options[0].id); }, [options, leadId]);
  const detail = useLoad(() => (leadId ? api.leads.get(leadId) : Promise.resolve(null)), [leadId]);
  const money = detail.data?.money;

  const [status, setStatus] = useState<PaymentStatus>('PAID');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIST());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Fill the amount and date sensibly when the candidate or status changes
  useEffect(() => {
    if (!money) return;
    const promise = detail.data?.payments.find(p => p.status === 'PROMISED' && !p.closedAt);
    if (money.balance === 0) setStatus('PROMISED');
    const s = money.balance === 0 ? 'PROMISED' : status;
    setAmount(String(s === 'PARTIALLY_PAID' ? Math.round(money.balance / 2) : s === 'PROMISED' ? (promise?.amount ?? money.balance) : money.balance));
    setDate(s === 'PROMISED' ? (promise?.date ?? addDays(todayIST(), 3)) : todayIST());
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [money, status]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(''); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const needsReceipt = status !== 'PROMISED';
  const amt = Number(amount.replace(/\D/g, '')) || 0;
  let block = '';
  if (!leadId) block = 'Choose a candidate.';
  else if (!amt) block = 'Enter the amount.';
  else if (needsReceipt && money && amt > money.balance) block = `That's more than the balance of ${rupee(money.balance)}.`;
  else if (needsReceipt && !file) block = 'Add the receipt to save this payment.';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (block || !leadId) return setErr(block);
    setBusy(true);
    try {
      await api.payments.create({ leadId, status, amount: amt, date, note: note.trim() || undefined, receipt: needsReceipt ? file : null });
      toast(status === 'PROMISED' ? 'Promise saved' : 'Payment saved. Your admin will check the receipt.');
      nav('/bde/payments');
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead back={<Link to="/bde/payments" className="back">‹ My payments</Link>} title="Record payment">
        {money && <StatStrip items={[
          { name: 'Course fee', value: rupee(money.fee) },
          { name: 'Paid so far', value: rupee(money.paid), sub: 'not counting rejected receipts' },
          { name: 'Balance', value: rupee(money.balance) }
        ]} />}
      </PageHead>

      <main className="wrap">
        <form className="panel pay-form" noValidate onSubmit={save}>
          <div className="pay-cols">
            <div className="form-col">
              {!leads.data ? <Loading /> : (
                <label className="field">Candidate
                  <select className="select" value={leadId ?? ''} onChange={e => { setLeadId(Number(e.target.value)); setFile(null); }}>
                    {!options.length && <option value="">No leads yet</option>}
                    {options.map(l => <option key={l.id} value={l.id}>{l.name}, {l.course.name}</option>)}
                  </select>
                </label>
              )}

              <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <legend className="field" style={{ padding: '0 0 8px' }}>Payment status</legend>
                <div className="seg3">
                  {(Object.keys(LABEL) as PaymentStatus[]).map(st => (
                    <button key={st} type="button" aria-pressed={status === st} disabled={st !== 'PROMISED' && money?.balance === 0} onClick={() => setStatus(st)}>{LABEL[st]}</button>
                  ))}
                </div>
                {status === 'PROMISED' && <span className="small muted">Not paid yet. Enter the date they promised.</span>}
                {money?.balance === 0 && <span className="small muted">This candidate has paid the full fee.</span>}
              </fieldset>

              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
                <label className="field">{status === 'PROMISED' ? 'Amount promised' : 'Amount received'}
                  <span className="money"><span>₹</span><input inputMode="numeric" autoComplete="off" value={amt ? amt.toLocaleString('en-IN') : ''} onChange={e => { setAmount(e.target.value); setErr(''); }} /></span>
                </label>
                <label className="field">{status === 'PROMISED' ? 'Promised for' : 'Payment date'}
                  <input className="input" type="date" value={date} min={status === 'PROMISED' ? todayIST() : undefined} max={status === 'PROMISED' ? undefined : todayIST()} onChange={e => setDate(e.target.value)} />
                </label>
              </div>

              <label className="field">Note (optional)
                <textarea className="textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
              </label>
            </div>

            <div className="form-col">
              {needsReceipt ? (
                <>
                  <div className="sec-head"><span className="field" style={{ padding: 0 }}>Receipt or payment screenshot</span>{!file && <b className="small" style={{ color: 'var(--red)' }}>Required</b>}</div>
                  {file ? (
                    <div className="attached">
                      <div className="img" style={preview ? { backgroundImage: `url(${preview})` } : undefined} />
                      <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</b><span className="small muted">{Math.max(1, Math.round(file.size / 1024))} KB</span></div>
                      <button type="button" className="btn ghost sm" onClick={() => setFile(null)}>Remove</button>
                    </div>
                  ) : (
                    <div className="upload">
                      <label style={{ gridColumn: '1 / -1' }}>
                        <input type="file" accept="image/*,application/pdf" onChange={e => {
                          const f = e.target.files?.[0];
                          if (f && f.size > 5 * 1024 * 1024) { setErr('The file is larger than 5 MB.'); return; }
                          setFile(f ?? null); setErr('');
                        }} />
                        {Icons.upload}Choose the receipt
                        <span className="small muted">Photo, screenshot or PDF, up to 5 MB</span>
                      </label>
                    </div>
                  )}
                  <span className="small muted">Your admin checks the receipt. Money counts as revenue once it is verified.</span>
                </>
              ) : <div className="notice-soft small">A promise needs no receipt. When the money arrives, record it again as Part paid or Paid in full with the receipt.</div>}
            </div>
          </div>

          <div className="panel-foot pay-foot">
            <span className="err" role="alert">{err || block}</span>
            <button type="submit" className="btn" style={{ minWidth: 180 }} disabled={busy || !!block}>{busy ? 'Saving…' : 'Save payment'}</button>
          </div>
        </form>
      </main>
    </>
  );
}
