import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Lead, type Outcome, type Today } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { OUTCOMES, OUTCOME_CLASS, OUTCOME_LABEL, STAGE_LABEL, addDays, todayIST } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Loading } from '../../components/ui';

const NEW = 'new' as const;
type Pick = number | typeof NEW | null;

/**
 * Today's call list: the students due today and overdue, plus "New number" for someone not in the list.
 * Pick who you called, then tap how it went (or press 1 to 4). A call to a student also updates their status,
 * follow-up and history; a new number is only counted.
 */
export function CallList({ sent, onDay, refresh }: { sent: boolean; onDay: (d: Today) => void; refresh: number }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const list = useLoad(() => api.leads.list({ view: 'due', q: q.trim() || undefined }), [q, refresh]);
  const [done, setDone] = useState<number[]>([]); // called just now, hidden until the list is read again
  useEffect(() => setDone([]), [list.data]);
  const leads = (list.data?.leads ?? []).filter(l => !done.includes(l.id));
  // Overdue = the follow-up date is already past; they stay on the list until called
  const overdueCount = leads.filter(l => l.followUpOn && l.followUpOn < todayIST()).length;
  const [pick, setPick] = useState<Pick>(null);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [number, setNumber] = useState('');
  const [interested, setInterested] = useState<string | null>(null); // a new number that was interested
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // blocks a second key press before the first one has re-rendered
  const [last, setLast] = useState<{ callId: number; name: string; outcome: Outcome } | null>(null); // the call just logged, to undo

  const choose = (p: Pick) => { if (p !== null) setLast(null); setPick(p); setMore(false); setNote(''); setDate(''); if (p !== NEW) setInterested(null); };

  // New numbers: every tap is sent at once and none are dropped; only the newest answer is shown.
  const sentSeq = useRef(0), shownSeq = useRef(0), inFlight = useRef(0);
  async function logNew(o: Outcome) {
    navigator.vibrate?.(12);
    setInterested(o === 'INTERESTED' ? number.trim() : null);
    const seq = ++sentSeq.current;
    inFlight.current++;
    try {
      const day = await api.today.logCall(o);
      if (seq > shownSeq.current) { shownSeq.current = seq; onDay(day); }
      toast(`New number: ${OUTCOME_LABEL[o]}`);
      setNumber('');
    } catch (e) { toast(errorText(e)); } finally {
      if (--inFlight.current === 0 && sentSeq.current > 1) api.today.get().then(onDay).catch(() => {});
    }
  }

  // One call per pick: the student is un-picked at once, so extra taps or key presses can't reach anyone else.
  // The BDE picks the next student themselves.
  async function logLead(lead: Lead, o: Outcome) {
    if (savingRef.current) return;
    savingRef.current = true;
    navigator.vibrate?.(12);
    setSaving(true);
    const extra = { leadId: lead.id, note: note.trim() || undefined, followUpOn: o === 'NOT_INTERESTED' ? undefined : date || undefined };
    choose(null);
    try {
      const day = await api.today.logCall(o, extra);
      onDay(day);
      setDone(d => [...d, lead.id]);
      const call = day.recent.find(c => c.lead?.id === lead.id);
      setLast(call ? { callId: call.id, name: lead.name, outcome: o } : null);
    } catch (e) { toast(errorText(e)); choose(lead.id); } finally { savingRef.current = false; setSaving(false); }
  }

  async function undoLast() {
    if (!last) return;
    try {
      onDay(await api.today.undoCall(last.callId));
      toast(`Undone: ${last.name}, ${OUTCOME_LABEL[last.outcome]}`);
      setLast(null);
      await list.reload();
    } catch (e) { toast(errorText(e)); }
  }

  const log = (o: Outcome) => {
    if (pick === NEW) return void logNew(o);
    const lead = leads.find(l => l.id === pick);
    if (lead) void logLead(lead, o);
    else toast('Pick who you called first');
  };

  // Keys: 1 to 4 log a call for the picked row; up and down arrows move through the list
  const keyRef = useRef({ log, pick, leads, choose });
  keyRef.current = { log, pick, leads, choose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (sent || e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, dialog[open]')) return;
      const k = keyRef.current;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) { e.preventDefault(); k.log(OUTCOMES[i]); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const ids: Pick[] = k.leads.map(l => l.id);
        if (!ids.length) return;
        const at = ids.indexOf(k.pick);
        const to = e.key === 'ArrowDown' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at - 1);
        k.choose(ids[to]);
        document.getElementById(`call-${ids[to]}`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sent]);

  const outcomes = (disabled: boolean) => (
    <div className="cc-outcomes" role="group" aria-label="How did the call go?">
      {OUTCOMES.map((o, i) => (
        <button key={o} type="button" className={`cc-btn ${OUTCOME_CLASS[o]}`} disabled={disabled} onClick={e => { e.stopPropagation(); log(o); }} aria-keyshortcuts={String(i + 1)}>
          {OUTCOME_LABEL[o]}<kbd>{i + 1}</kbd>
        </button>
      ))}
    </div>
  );

  return (
    <section className="panel" aria-label="Call list">
      <div className="panel-head">
        <div>
          <h2>Call list</h2>
          {list.data && <span className="small muted">{q ? `${leads.length} found` : <>Students whose follow-up date has come: <b>{leads.length - overdueCount}</b> due today, <b>{overdueCount}</b> overdue</>}</span>}
        </div>
        <span className="small muted keys-hint">Pick who you called, then tap how it went (keys: ↑ ↓ to pick, 1 to 4)</span>
      </div>
      <div className="toolbar">
        <label className="sr-only" htmlFor="call-q">Search the call list</label>
        <input className="input search" id="call-q" type="search" placeholder="Search name or phone" value={q} onChange={e => { setQ(e.target.value); setDone([]); }} />
        <span className="spacer" />
        <button type="button" className="btn ghost" aria-pressed={pick === NEW} aria-expanded={pick === NEW} onClick={() => choose(pick === NEW ? null : NEW)}>+ New number</button>
      </div>
      {/* A call to someone not in the list: kept above the list so it never pushes the students down */}
      {pick === NEW && (
        <div id="call-new" className="call-row on">
          <div className="call-body">
            <label className="field call-number">Their number (optional)
              <input className="input" inputMode="tel" value={number} onChange={e => setNumber(e.target.value)} placeholder="98xxx xxxxx" />
            </label>
            {outcomes(sent)}
            {interested !== null && !sent && (
              <p className="small">Interested? <Link to={`/bde/leads?add=1${interested ? `&phone=${encodeURIComponent(interested)}` : ''}`}>Add them as a lead</Link></p>
            )}
            <button type="button" className="linkbtn cc-more-link" onClick={() => choose(null)}>Close</button>
          </div>
        </div>
      )}
      {sent && <p className="notice" role="status">The report is sent, so calls are locked. Use "Make a correction" to change them.</p>}

      {last && (
        <div className="call-done" role="status">
          <span><b>{last.name}</b>: {OUTCOME_LABEL[last.outcome]}. Pick the next student.</span>
          <button type="button" className="linkbtn" onClick={undoLast}>Undo</button>
        </div>
      )}
      <div className="call-list">
        {list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : leads.map(l => {
          const on = pick === l.id;
          const digits = l.phone.replace(/\D/g, '');
          return (
            <div id={`call-${l.id}`} key={l.id} className={`call-row${on ? ' on' : ''}`}>
              <div className="call-top">
                <button type="button" className="call-pick" aria-expanded={on} onClick={() => choose(on ? null : l.id)}>
                  <span className="cc-name">{l.name}</span>
                  <span className="cc-meta"><Badge label={STAGE_LABEL[l.stage]} />{l.followUpOn && <Due date={l.followUpOn} />}<span className="muted">{l.course.name}</span></span>
                  {l.nextAction && <span className="small">Next: {l.nextAction}</span>}
                </button>
                <div className="cc-dial">
                  <a className="btn" href={`tel:+${digits}`} onClick={() => { if (!on) choose(l.id); }}>{l.phone}</a>
                  <a className="btn ghost" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              </div>
              {on && (
                <div className="call-body">
                  {outcomes(sent || saving)}
                  {more ? (
                    <div className="cc-more">
                      <label className="field">Note (optional)<input className="input" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="e.g. Asked for the fee details" /></label>
                      <label className="field">Next call on<input className="input" type="date" min={todayIST()} value={date || addDays(todayIST(), 1)} onChange={e => setDate(e.target.value)} /></label>
                    </div>
                  ) : (
                    <button type="button" className="linkbtn cc-more-link" onClick={() => setMore(true)}>+ Add a note or change the next call date</button>
                  )}
                  <Link className="small" to={`/bde/leads/${l.id}`}>Open {l.name}'s page</Link>
                </div>
              )}
            </div>
          );
        })}
        {list.data && !leads.length && <Empty title={q ? 'No one matches' : 'No one left to call today'}>{q ? '' : 'Use "New number" for calls to people not in your list.'}</Empty>}
      </div>
    </section>
  );
}
