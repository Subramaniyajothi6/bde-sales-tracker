import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type LeadDetail as Detail, type Stage } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { CHECK_LABEL, INTERVIEW_LABEL, PAYMENT_LABEL, RESULT_LABEL, STAGES, STAGE_LABEL, addDays, fmtDate, fmtTime, istDate, rupee, todayIST } from '../../lib/format';
import { Badge, ErrorNote, Icons, Loading, Modal } from '../../components/ui';

export default function LeadDetail() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.leads.get(id), [id]);
  const [fu, setFu] = useState('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [ivOpen, setIvOpen] = useState(false);

  useEffect(() => {
    if (data) { setFu(data.lead.followUpOn ?? ''); setNext(data.lead.nextAction ?? ''); }
  }, [data]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try { await fn(); toast(msg); await reload(); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  if (error) return <main className="bde-main"><ErrorNote error={error} onRetry={reload} /></main>;
  if (!data) return <main className="bde-main"><Loading /></main>;
  const { lead, money } = data;
  const digits = lead.phone.replace(/\D/g, '');
  const openInterview = data.interviews.some(i => i.status === 'SCHEDULED');

  return (
    <>
      <section className="bde-head">
        <div className="top"><Link to="/bde/leads">‹ My leads</Link><span>L-{lead.id}</span></div>
        <h1>{lead.name}</h1>
        <p>{lead.course.name}, fee <b>{rupee(money.fee)}</b>{money.paid > 0 && <>, balance <b>{rupee(money.balance)}</b></>}</p>
        <div className="contact">
          <a className="call" href={`tel:+${digits}`}>{Icons.phone}{lead.phone}</a>
          <a className="wa" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        </div>
      </section>

      <main className="bde-main">
        <label className="field">Status
          <select className="select" value={lead.stage} disabled={busy}
            onChange={e => {
              const stage = e.target.value as Stage;
              void run(() => api.leads.update(id, { stage }), `Status: ${STAGE_LABEL[stage]}`);
              if (stage === 'INTERVIEW_SCHEDULED' && !openInterview) setIvOpen(true);
            }}>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>

        <section className="sec">
          <h2>Next step</h2>
          <form className="panel panel-pad form-col" noValidate
            onSubmit={e => { e.preventDefault(); void run(() => api.leads.update(id, { followUpOn: fu || null, nextAction: next.trim() || null }), fu ? `Follow-up set for ${fmtDate(fu)}` : 'Saved'); }}>
            <label className="field">Follow-up date<input className="input" type="date" value={fu} onChange={e => setFu(e.target.value)} /></label>
            <label className="field">Next action<input className="input" value={next} onChange={e => setNext(e.target.value)} placeholder="e.g. Send fee details" /></label>
            <button type="submit" className="btn" disabled={busy}>Save</button>
          </form>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            <button type="button" className="btn ghost" disabled={openInterview} onClick={() => setIvOpen(true)} title={openInterview ? 'An interview is already booked' : undefined}>Schedule interview</button>
            <Link className="btn ghost" to={`/bde/payments/new?lead=${lead.id}`}>Record payment</Link>
          </div>
        </section>

        <section className="sec">
          <h2>History</h2>
          <form noValidate style={{ display: 'flex', gap: 8 }}
            onSubmit={e => { e.preventDefault(); if (note.trim()) void run(async () => { await api.leads.addNote(id, note.trim()); setNote(''); }, 'Note added'); }}>
            <label className="sr-only" htmlFor="note">Add a note</label>
            <input className="input" id="note" placeholder="Add a note" value={note} onChange={e => setNote(e.target.value)} />
            <button type="submit" className="btn ghost" disabled={busy || !note.trim()}>Add</button>
          </form>
          <div className="panel panel-pad"><History data={data} /></div>
        </section>
      </main>

      <ScheduleInterview open={ivOpen} leadId={id} name={lead.name} onClose={() => setIvOpen(false)} onDone={reload} />
    </>
  );
}

function History({ data }: { data: Detail }) {
  const items = [
    ...data.notes.map(n => ({ at: n.createdAt, node: <span>{n.text}</span> })),
    ...data.interviews.map(i => ({ at: i.scheduledAt, node: <span>Interview at {fmtTime(i.scheduledAt)}: <Badge label={INTERVIEW_LABEL[i.status]} /> {i.result && <Badge label={RESULT_LABEL[i.result]} />}</span> })),
    ...data.payments.map(p => ({ at: `${p.date}T12:00:00Z`, node: <span>{PAYMENT_LABEL[p.status]} {rupee(p.amount)} {p.check && <Badge label={CHECK_LABEL[p.check]} />}</span> }))
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <div className="timeline">
      {items.map((it, i) => <div className="t" key={i}><span className="when">{fmtDate(istDate(it.at))}</span>{it.node}</div>)}
    </div>
  );
}

export function ScheduleInterview({ open, leadId, name, onClose, onDone }: { open: boolean; leadId: number; name: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(addDays(todayIST(), 1));
  const [time, setTime] = useState('11:00');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!date || !time) return setErr('Choose a date and time.');
    setBusy(true);
    try {
      await api.interviews.create(leadId, date, time);
      toast(`Interview booked for ${name}, ${fmtDate(date)}`);
      onClose(); onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} title="Schedule interview" onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy}>Book interview</button></>}>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <label className="field">Date<input className="input" type="date" min={todayIST()} value={date} onChange={e => { setDate(e.target.value); setErr(''); }} /></label>
        <label className="field">Time<input className="input" type="time" value={time} onChange={e => { setTime(e.target.value); setErr(''); }} /></label>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
    </Modal>
  );
}
