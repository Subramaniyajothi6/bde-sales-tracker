import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Today as TodayData } from '../../api';
import { useAuth } from '../../lib/auth';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { OUTCOMES, OUTCOME_COLOR, OUTCOME_LABEL, fmtDate, fmtTime } from '../../lib/format';
import { Empty, ErrorNote, Loading, SourceTag, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { CallList } from './CallList';

export default function Today() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData, error, reload } = useLoad(() => api.today.get());
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0); // read the call list again after an undo
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
  const sent = !!data?.submittedAt;
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
            <CallList sent={sent} onDay={setData} refresh={refresh} />
            <section className="panel" aria-label="Today's history">
              <div className="panel-head"><h2>Today's history</h2><span className="small muted">{OUTCOMES.map(o => `${data.counts[o]} ${OUTCOME_LABEL[o].toLowerCase()}`).join(', ')}</span></div>
              <div className="history-list">
                {data.history.map(h => h.kind === 'CALL' && h.outcome ? (
                  <div className="log-row" key={`c${h.id}`}>
                    <span className="dot" style={{ background: OUTCOME_COLOR[h.outcome] }} />
                    <span className="t">{fmtTime(h.at)}</span>
                    <span className="what">{h.lead ? <><Link to={`/bde/leads/${h.lead.id}`}>{h.lead.name}</Link>: </> : 'New number: '}{OUTCOME_LABEL[h.outcome]}</span>
                    <SourceTag source="CALL" />
                    {!sent && <button type="button" className="linkbtn" disabled={busy} onClick={() => act(() => api.today.undoCall(h.id), h.lead ? `Undone: ${h.lead.name}, ${OUTCOME_LABEL[h.outcome!]}` : `Removed one "${OUTCOME_LABEL[h.outcome!]}"`).then(() => setRefresh(n => n + 1))}>Undo</button>}
                  </div>
                ) : (
                  <div className="log-row" key={`s${h.id}`}>
                    <span className="dot sheet-dot" />
                    <span className="t">{fmtTime(h.at)}</span>
                    <span className="what">{h.lead && <><Link to={`/bde/leads/${h.lead.id}`}>{h.lead.name}</Link>: </>}<span className="sheet-lines">{h.lines.join('; ')}</span></span>
                    <SourceTag source="SHEET" />
                  </div>
                ))}
              </div>
              {!data.history.length && <Empty title="Nothing yet today">Calls you log and changes from Excel appear here, marked "Call list" or "Excel". Undo puts a wrong call right and the student back as they were.</Empty>}
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
