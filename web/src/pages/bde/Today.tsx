import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Outcome, type Today as TodayData } from '../../api';
import { useAuth } from '../../lib/auth';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { OUTCOMES, OUTCOME_CLASS, OUTCOME_COLOR, OUTCOME_LABEL, fmtDate, fmtTime } from '../../lib/format';
import { Empty, ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

export default function Today() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData, error, reload } = useLoad(() => api.today.get());
  const [busy, setBusy] = useState(false);
  const [lastWasInterested, setLastWasInterested] = useState(false);
  const [note, setNote] = useState('');

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
    return act(() => api.today.logCall(o), `Logged: ${OUTCOME_LABEL[o]}`);
  };

  // Keys 1 to 4 log a call, so a BDE on a headset at a laptop doesn't need the mouse
  const logRef = useRef(log);
  logRef.current = log;
  const sent = !!data?.submittedAt;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (sent || e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, dialog[open]')) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) { e.preventDefault(); void logRef.current(OUTCOMES[i]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sent]);

  if (error) return <main className="wrap"><ErrorNote error={error} onRetry={reload} /></main>;
  if (!data) return <main className="wrap"><Loading /></main>;

  const left = data.target - data.total;
  const todo = ([
    [data.todo.followUps, 'follow-up calls due', '/bde/leads?view=due'],
    [data.todo.interviewsToMark, 'interviews to mark', '/bde/interviews'],
    [data.todo.paymentsDue, 'payments to collect', '/bde/payments']
  ] as const).filter(([n]) => n > 0);
  const day = data.punchIn ? `Started ${fmtTime(data.punchIn)}${data.punchOut ? `, finished ${fmtTime(data.punchOut)}` : ''}` : data.onLeave ? 'On approved leave' : 'Not started yet';

  return (
    <>
      <PageHead title={`Today, ${fmtDate(data.date, true)}`} sub={<>{user?.name}, {user?.employeeId}. <span className={data.punchIn ? 'ok-text' : undefined}>{day}.</span></>}>
        <StatStrip items={[
          { name: 'Calls today', value: <>{data.total} <small className="of-inline">of {data.target}</small></>, sub: <span className="meter-sub"><span className="meterbar"><i style={{ width: `${Math.min(100, (data.total / data.target) * 100)}%` }} /></span>{left <= 0 ? 'Target reached' : `${left} more to reach your target`}</span> },
          { name: 'Interested', value: data.counts.INTERESTED },
          { name: 'Call back later', value: data.counts.CALL_BACK },
          { name: 'Report', value: sent ? 'Sent' : 'Not sent', sub: sent ? `at ${fmtTime(data.submittedAt!)}` : `due ${data.cutoff === '19:30' ? '7:30 pm' : data.cutoff}` }
        ]} />
      </PageHead>
      <main className="wrap">
        {data.onLeave && !data.punchIn && <div className="notice" role="status">You're on approved leave today. If you work anyway, your calls still count.</div>}
        <div className="row">
          <div className="grow col">
            <section className="panel" aria-label="Log a call">
              <div className="panel-head"><h2>Log a call</h2><span className="small muted keys-hint">Tip: press 1, 2, 3 or 4</span></div>
              <div className="panel-pad">
                <div className="pad">
                  {OUTCOMES.map((o, i) => (
                    <button key={o} type="button" className={OUTCOME_CLASS[o]} disabled={sent || busy} onClick={() => log(o)}
                      aria-label={`Log one ${OUTCOME_LABEL[o].toLowerCase()} call`} aria-keyshortcuts={String(i + 1)}>
                      <span className="lbl">{OUTCOME_LABEL[o]}<kbd>{i + 1}</kbd></span><span className="n">{data.counts[o]}</span>
                    </button>
                  ))}
                </div>
                {lastWasInterested && !sent && <p className="small" style={{ marginTop: 12 }}>Interested? <Link to="/bde/leads?add=1">Add them as a lead</Link></p>}
                {sent && <p className="small muted" style={{ marginTop: 12 }}>The report is sent, so calls are locked. Use "Make a correction" to change them.</p>}
              </div>
            </section>
            <section className="panel" aria-label="Recent calls">
              <div className="panel-head"><h2>Last calls</h2><span className="small muted">Undo a wrong tap</span></div>
              {data.recent.map(c => (
                <div className="log-row" key={c.id}>
                  <span className="dot" style={{ background: OUTCOME_COLOR[c.outcome] }} />
                  <span className="t">{fmtTime(c.calledAt)}</span>
                  <span className="what">{OUTCOME_LABEL[c.outcome]}</span>
                  {!sent && <button type="button" className="linkbtn" disabled={busy} onClick={() => act(() => api.today.undoCall(c.id), `Removed one "${OUTCOME_LABEL[c.outcome]}"`)}>Undo</button>}
                </div>
              ))}
              {!data.recent.length && <Empty title="No calls yet">Calls you log appear here so you can fix a wrong tap.</Empty>}
            </section>
          </div>

          <aside className="side">
            {!data.punchIn && !data.onLeave && (
              <section className="start-day" aria-label="Start your day">
                <div><b>Start your day</b><span className="small muted">Tap when you begin work. This marks your attendance.</span></div>
                <button type="button" className="btn" disabled={busy} onClick={() => act(() => api.today.punchIn(), 'Good morning. Your day has started.')}>Start my day</button>
              </section>
            )}
            <section className="panel" aria-label="To do">
              <div className="panel-head"><h2>To do</h2></div>
              {todo.map(([n, label, to]) => (
                <Link className="list-row" to={to} key={label}><span className="count">{n}</span><span className="grow-1">{label}</span><span className="muted" aria-hidden="true">›</span></Link>
              ))}
              {!todo.length && <Empty title="Nothing else today" />}
            </section>
            <section className="panel panel-pad form-col" aria-label="Daily report">
              <div className="sec-head"><h2 className="h2">Today's report</h2><span className="small muted">Due {data.cutoff === '19:30' ? '7:30 pm' : data.cutoff}</span></div>
              {sent ? (
                <>
                  <div className="submitted" role="status">Sent at {fmtTime(data.submittedAt!)}{data.note && <span className="sent-note">Your note: {data.note}</span>}</div>
                  <button type="button" className="btn ghost block" disabled={busy} onClick={() => { setNote(data.note ?? ''); void act(() => api.today.reopen(), 'Report reopened. Send it again when you are done.'); }}>Make a correction</button>
                </>
              ) : (
                <>
                  <label className="field">Note for your admin (optional)
                    <textarea className="textarea" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything to flag? e.g. lead list finished, network problem" />
                  </label>
                  <button type="button" className="btn block" style={{ minHeight: 44 }} disabled={busy} onClick={() => act(() => api.today.submit(note.trim()), "Today's report sent. Your day is finished.")}>Send today's report</button>
                  <span className="small muted">Sending the report also ends your working day.</span>
                </>
              )}
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
