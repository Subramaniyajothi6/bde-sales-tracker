import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Interview } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { INTERVIEW_LABEL, RESULT_LABEL, fmtDate, fmtTime, istDate, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading } from '../../components/ui';

type When = 'today' | 'upcoming' | 'past';

export default function Interviews() {
  const [when, setWhen] = useState<When>('today');
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.interviews.list(when), [when]);
  const [busy, setBusy] = useState(false);

  async function mark(i: Interview, b: Parameters<typeof api.interviews.mark>[1], msg: string) {
    setBusy(true);
    try { await api.interviews.mark(i.id, b); toast(msg); await reload(); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <section className="bde-head"><h1>My interviews</h1></section>
      <main className="bde-main">
        <div className="seg" role="group" aria-label="Show" style={{ width: '100%' }}>
          {(['today', 'upcoming', 'past'] as When[]).map(w => (
            <button key={w} type="button" style={{ flex: 1 }} aria-pressed={when === w} onClick={() => setWhen(w)}>{w[0].toUpperCase() + w.slice(1)}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : data.interviews.map(i => {
            const first = i.lead.name.split(' ')[0];
            const d = istDate(i.scheduledAt);
            const [hm, ap] = fmtTime(i.scheduledAt).split(' ');
            let acts = null;
            if (i.status === 'SCHEDULED' && d <= todayIST()) acts = (
              <><p className="small" style={{ margin: 0, fontWeight: 600 }}>Did {first} come?</p>
                <div className="iv-acts">
                  <button type="button" className="btn" disabled={busy} onClick={() => mark(i, { status: 'ATTENDED' }, `${i.lead.name} attended`)}>Attended</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => mark(i, { status: 'NO_SHOW' }, `${i.lead.name} missed it. Follow-up set for tomorrow.`)}>Didn't come</button>
                </div></>);
            else if (i.status === 'ATTENDED' && !i.result) acts = (
              <><p className="small" style={{ margin: 0, fontWeight: 600 }}>Result?</p>
                <div className="iv-acts">
                  <button type="button" className="btn" disabled={busy} onClick={() => mark(i, { result: 'SELECTED' }, `${i.lead.name}: selected`)}>Selected</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => mark(i, { result: 'NOT_SELECTED' }, `${i.lead.name}: not selected`)}>Not selected</button>
                </div></>);
            else if (i.result === 'SELECTED' && i.lead.stage === 'SELECTED') acts = (
              <div className="iv-acts"><Link className="btn" to={`/bde/payments/new?lead=${i.lead.id}`}>Record payment</Link><Link className="btn ghost" to={`/bde/leads/${i.lead.id}`}>Follow up</Link></div>);
            else if (i.status === 'NO_SHOW') acts = (
              <div className="iv-acts"><Link className="btn ghost" to={`/bde/leads/${i.lead.id}`}>Reschedule</Link><a className="btn ghost" href={`tel:+${i.lead.phone.replace(/\D/g, '')}`}>Call</a></div>);
            return (
              <article className="iv" key={i.id}>
                <div className="iv-top">
                  <div className="iv-when"><span className="digits">{hm}</span><small>{ap}, {d === todayIST() ? 'today' : fmtDate(d)}</small></div>
                  <Link to={`/bde/leads/${i.lead.id}`} style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}><b style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{i.lead.name}</b></Link>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <Badge label={INTERVIEW_LABEL[i.status]} />{i.result && <Badge label={RESULT_LABEL[i.result]} />}
                  </span>
                </div>
                {acts}
              </article>
            );
          })}
          {data && !data.interviews.length && <div className="panel"><Empty title={when === 'today' ? 'No interviews today' : when === 'upcoming' ? 'Nothing scheduled yet' : 'No past interviews'} /></div>}
        </div>
      </main>
    </>
  );
}
