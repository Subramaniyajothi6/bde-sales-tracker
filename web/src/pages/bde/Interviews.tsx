import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Interview } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { INTERVIEW_LABEL, RESULT_LABEL, fmtDate, fmtTime, istDate, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

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

  /** What the BDE can do next with this interview */
  function actions(i: Interview) {
    const d = istDate(i.scheduledAt);
    if (i.status === 'SCHEDULED' && d <= todayIST()) return (
      <><span className="small act-q">Did {i.lead.name.split(' ')[0]} come?</span>
        <button type="button" className="btn sm" disabled={busy} onClick={() => mark(i, { status: 'ATTENDED' }, `${i.lead.name} attended`)}>Attended</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => mark(i, { status: 'NO_SHOW' }, `${i.lead.name} missed it. Follow-up set for tomorrow.`)}>Didn't come</button></>);
    if (i.status === 'ATTENDED' && !i.result) return (
      <><span className="small act-q">Result?</span>
        <button type="button" className="btn sm" disabled={busy} onClick={() => mark(i, { result: 'SELECTED' }, `${i.lead.name}: selected`)}>Selected</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => mark(i, { result: 'NOT_SELECTED' }, `${i.lead.name}: not selected`)}>Not selected</button></>);
    if (i.result === 'SELECTED' && i.lead.stage === 'SELECTED') return <Link className="btn sm" to={`/bde/payments/new?lead=${i.lead.id}`}>Record payment</Link>;
    if (i.status === 'NO_SHOW') return <Link className="btn ghost sm" to={`/bde/leads/${i.lead.id}`}>Reschedule</Link>;
    return null;
  }

  return (
    <>
      <PageHead title="My interviews" tools={
        <div className="seg" role="group" aria-label="Show">
          {(['today', 'upcoming', 'past'] as When[]).map(w => (
            <button key={w} type="button" aria-pressed={when === w} onClick={() => setWhen(w)}>{w[0].toUpperCase() + w.slice(1)}</button>
          ))}
        </div>} />
      <main className="wrap">
        <section className="panel">
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
            <div className="scroll">
              <table className="data stack">
                <thead><tr><th scope="col">When</th><th scope="col">Candidate</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.interviews.map(i => {
                    const d = istDate(i.scheduledAt);
                    return (
                      <tr key={i.id}>
                        <td data-label="When"><b>{d === todayIST() ? 'Today' : fmtDate(d, true)}</b> <span className="muted">{fmtTime(i.scheduledAt)}</span></td>
                        <td className="who" data-label="Candidate"><Link to={`/bde/leads/${i.lead.id}`}><b>{i.lead.name}</b></Link><small>{i.lead.phone}</small></td>
                        <td data-label="Course">{i.lead.course}</td>
                        <td data-label="Status"><span className="badges"><Badge label={INTERVIEW_LABEL[i.status]} />{i.result && <Badge label={RESULT_LABEL[i.result]} />}</span></td>
                        <td className="acts-cell"><div className="iv-acts-row">{actions(i)}</div></td>
                      </tr>
                    );
                  })}
                  {!data.interviews.length && <tr><td colSpan={5}><Empty title={when === 'today' ? 'No interviews today' : when === 'upcoming' ? 'Nothing scheduled yet' : 'No past interviews'}>
                    {when !== 'past' && 'Book one from a lead\'s page.'}</Empty></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
