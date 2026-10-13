import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Interview } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { INTERVIEW_LABEL, RESULT_LABEL, fmtDate, fmtTime, int, istDate, monthName, pct, todayIST } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

type When = 'today' | 'upcoming' | 'past' | 'all';

export default function Interviews() {
  const toast = useToast();
  const [when, setWhen] = useState<When>('today');
  const att = useLoad(() => api.stats.attendance());
  const { data, error, reload } = useLoad(() => api.interviews.list(when), [when]);
  const [busy, setBusy] = useState(false);

  async function mark(i: Interview, b: Parameters<typeof api.interviews.mark>[1], msg: string) {
    setBusy(true);
    try { await api.interviews.mark(i.id, b); toast(msg); await Promise.all([reload(), att.reload()]); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }
  const t = att.data?.totals;

  return (
    <>
      <PageHead title="Interviews" sub={att.data ? monthName(att.data.month) : undefined}>
        {t && <StatStrip items={[
          { name: 'Scheduled', value: int(t.scheduled) },
          { name: 'Attended', value: int(t.attended), sub: `${pct(t.attended, t.attended + t.missed)} of those marked` },
          { name: 'Missed', value: int(t.missed) }
        ]} />}
      </PageHead>
      <main className="wrap">
        <div className="row">
          <section className="panel grow">
            <div className="panel-head">
              <h2>Interviews</h2>
              <div className="seg" role="group" aria-label="Show">
                {(['today', 'upcoming', 'past', 'all'] as When[]).map(w => <button key={w} type="button" aria-pressed={when === w} onClick={() => setWhen(w)}>{w[0].toUpperCase() + w.slice(1)}</button>)}
              </div>
            </div>
            {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
              <div className="scroll">
                <table className="data">
                  <thead><tr><th scope="col">When</th><th scope="col">Candidate</th><th scope="col">BDE</th><th scope="col">Status</th><th scope="col">Result</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {data.interviews.map(i => {
                      const d = istDate(i.scheduledAt);
                      return (
                        <tr key={i.id}>
                          <td><b>{d === todayIST() ? 'Today' : fmtDate(d, true)}</b><br /><small className="muted">{fmtTime(i.scheduledAt)}</small></td>
                          <td className="who"><b>{i.lead.name}</b></td>
                          <td>{i.owner.name}</td>
                          <td><Badge label={INTERVIEW_LABEL[i.status]} /></td>
                          <td>{i.result ? <Badge label={RESULT_LABEL[i.result]} /> : <span className="muted">–</span>}</td>
                          <td><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {i.status === 'SCHEDULED' && d <= todayIST() && <>
                              <button type="button" className="btn sm" disabled={busy} onClick={() => mark(i, { status: 'ATTENDED' }, `${i.lead.name}: attended`)}>Attended</button>
                              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => mark(i, { status: 'NO_SHOW' }, `${i.lead.name}: missed`)}>Didn't come</button></>}
                            {i.status === 'ATTENDED' && !i.result && <>
                              <button type="button" className="btn sm" disabled={busy} onClick={() => mark(i, { result: 'SELECTED' }, `${i.lead.name}: selected`)}>Selected</button>
                              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => mark(i, { result: 'NOT_SELECTED' }, `${i.lead.name}: not selected`)}>Not selected</button></>}
                          </div></td>
                        </tr>
                      );
                    })}
                    {!data.interviews.length && <tr><td colSpan={6}><Empty title={`No interviews ${when === 'today' ? 'today' : 'here'}`} /></td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <aside className="side">
            <section className="panel">
              <div className="panel-head"><h2>Lowest attendance</h2></div>
              {att.data?.lowest.map(x => (
                <Link className="list-row" key={x.bde.id} to={`/admin/bde/${x.bde.id}`}>
                  <span className="grow-1"><b>{x.bde.name}</b><span className="sub">{x.attended} of {x.scheduled} came</span></span>
                  <span className="digits">{Math.round(x.rate * 100)}%</span>
                </Link>
              ))}
              {att.data && !att.data.lowest.length && <Empty title="No interviews yet this month" />}
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
