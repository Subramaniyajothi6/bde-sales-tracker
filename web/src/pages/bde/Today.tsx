import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Outcome, type Today as TodayData } from '../../api';
import { useAuth } from '../../lib/auth';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { OUTCOMES, OUTCOME_CLASS, OUTCOME_COLOR, OUTCOME_LABEL, fmtDate, fmtTime } from '../../lib/format';
import { ErrorNote, Loading } from '../../components/ui';

export default function Today() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData, error, reload } = useLoad(() => api.today.get());
  const [busy, setBusy] = useState(false);
  const [lastWasInterested, setLastWasInterested] = useState(false);

  async function act(fn: () => Promise<TodayData>, msg?: string) {
    if (busy) return;
    setBusy(true);
    try {
      setData(await fn());
      if (msg) toast(msg);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const log = (o: Outcome) => {
    setLastWasInterested(o === 'INTERESTED');
    navigator.vibrate?.(12);
    return act(() => api.today.logCall(o));
  };

  if (error) return <main className="bde-main"><ErrorNote error={error} onRetry={reload} /></main>;
  if (!data) return <main className="bde-main"><Loading /></main>;

  const left = data.target - data.total;
  const sent = !!data.submittedAt;
  const todo = ([
    [data.todo.followUps, 'follow-up calls', '/bde/leads?view=due'],
    [data.todo.interviewsToMark, 'interviews to mark', '/bde/interviews'],
    [data.todo.paymentsDue, 'payments to collect', '/bde/payments']
  ] as const).filter(([n]) => n > 0);

  return (
    <>
      <section className="bde-head" aria-label="My calls today">
        <div className="top"><span><b>{user?.name}, {user?.employeeId}</b></span><span>{fmtDate(data.date, true)}</span></div>
        <div className="scoreline">
          <span className="total" aria-live="polite">{data.total}</span>
          <span className="tgt">of <b>{data.target}</b> calls</span>
        </div>
        <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (data.total / data.target) * 100)}%` }} /></div>
        <p>{left <= 0 ? <b style={{ color: 'var(--green)' }}>Target reached</b> : <><b>{left} more</b> to reach your target</>}</p>
      </section>

      <main className="bde-main">
        <section className="sec" aria-label="Log a call">
          <h2>Log a call</h2>
          <div className="pad">
            {OUTCOMES.map(o => (
              <button key={o} type="button" className={OUTCOME_CLASS[o]} disabled={sent || busy} onClick={() => log(o)}
                aria-label={`Log one ${OUTCOME_LABEL[o].toLowerCase()} call`}>
                <span className="lbl">{OUTCOME_LABEL[o]}</span><span className="n">{data.counts[o]}</span>
              </button>
            ))}
          </div>
          {lastWasInterested && !sent && <Link className="small" to="/bde/leads?add=1">Add as a lead</Link>}
        </section>

        <section className="sec" aria-label="Recent calls">
          <h2>Last calls</h2>
          <div className="card-list">
            {data.recent.slice(0, 3).map(c => (
              <div className="log-row" key={c.id}>
                <span className="dot" style={{ background: OUTCOME_COLOR[c.outcome] }} />
                <span className="t">{fmtTime(c.calledAt)}</span>
                <span className="what">{OUTCOME_LABEL[c.outcome]}</span>
                {!sent && <button type="button" className="linkbtn" disabled={busy} onClick={() => act(() => api.today.undoCall(c.id), `Removed one "${OUTCOME_LABEL[c.outcome]}"`)}>Undo</button>}
              </div>
            ))}
            {!data.recent.length && <div className="empty">Calls you log appear here so you can fix a wrong tap.</div>}
          </div>
        </section>

        <section className="sec" aria-label="To do">
          <h2>To do</h2>
          <div className="card-list">
            {todo.map(([n, label, to]) => (
              <Link className="list-row" to={to} key={label}><span className="count">{n}</span><span className="grow-1">{label}</span><span className="muted" aria-hidden="true">›</span></Link>
            ))}
            {!todo.length && <div className="empty">Nothing else today</div>}
          </div>
        </section>

        <section className="sec" aria-label="Daily report">
          <div className="sec-head"><h2>Today's report</h2><span className="small muted">Due {data.cutoff === '19:30' ? '7:30 pm' : data.cutoff}</span></div>
          {sent ? (
            <>
              <div className="submitted" role="status">Sent at {fmtTime(data.submittedAt!)}</div>
              <button type="button" className="btn ghost block" disabled={busy} onClick={() => act(() => api.today.reopen(), 'Report reopened. Send it again when you are done.')}>Make a correction</button>
            </>
          ) : (
            <button type="button" className="btn block" style={{ minHeight: 48 }} disabled={busy} onClick={() => act(() => api.today.submit(), "Today's report sent")}>Send today's report</button>
          )}
        </section>
      </main>
    </>
  );
}
