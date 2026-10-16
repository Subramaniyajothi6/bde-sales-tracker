import { useEffect, useState } from 'react';
import { api, type ActivityItem } from '../../api';
import { errorText, useLoad } from '../../lib/hooks';
import { fmtDate, fmtTime, istDate, todayIST } from '../../lib/format';
import { Empty, ErrorNote, Loading } from '../../components/ui';
import { PageHead } from '../../components/PageHead';

/** Words for each kind of activity, grouped for the filter. */
const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'Logged in', LOGOUT: 'Logged out', PASSWORD_CHANGED: 'Changed password',
  PUNCH_IN: 'Started the day', REPORT_SENT: 'Sent the daily report', REPORT_REOPENED: 'Reopened the report',
  LEAD_ADDED: 'Added a lead', LEAD_MOVED: 'Moved a lead', LEADS_IMPORTED: 'Imported leads',
  INTERVIEW_BOOKED: 'Booked an interview', INTERVIEW_MARKED: 'Marked an interview',
  PAYMENT_RECORDED: 'Recorded a payment', RECEIPT_VERIFIED: 'Verified a receipt', RECEIPT_REJECTED: 'Rejected a receipt',
  LEAVE_REQUESTED: 'Asked for leave', LEAVE_CANCELLED: 'Cancelled leave', LEAVE_APPROVED: 'Approved leave', LEAVE_REJECTED: 'Rejected leave',
  BDE_ADDED: 'Added a BDE', BDE_UPDATED: 'Changed a BDE', BDE_DEACTIVATED: 'Deactivated a BDE', BDE_REACTIVATED: 'Reactivated a BDE', PASSWORD_RESET: 'Reset a password'
};
const GROUPS: [string, string[]][] = [
  ['Logins', ['LOGIN', 'LOGOUT', 'PASSWORD_CHANGED']],
  ['Working day', ['PUNCH_IN', 'REPORT_SENT', 'REPORT_REOPENED']],
  ['Leads and interviews', ['LEAD_ADDED', 'LEAD_MOVED', 'LEADS_IMPORTED', 'INTERVIEW_BOOKED', 'INTERVIEW_MARKED']],
  ['Payments', ['PAYMENT_RECORDED', 'RECEIPT_VERIFIED', 'RECEIPT_REJECTED']],
  ['Leave', ['LEAVE_REQUESTED', 'LEAVE_CANCELLED', 'LEAVE_APPROVED', 'LEAVE_REJECTED']],
  ['Team', ['BDE_ADDED', 'BDE_UPDATED', 'BDE_DEACTIVATED', 'BDE_REACTIVATED', 'PASSWORD_RESET']]
];

export default function Activity() {
  const people = useLoad(() => api.users.list({ status: 'all' }));
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [date, setDate] = useState('');
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const filters = { userId: userId ? Number(userId) : undefined, action: action || undefined, date: date || undefined };

  async function load(before?: number) {
    setBusy(true);
    try {
      const r = await api.activity.list({ ...filters, before });
      setItems(prev => (before && prev ? [...prev, ...r.items] : r.items));
      setNext(r.nextBefore);
      setError('');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(null); void load(); }, [userId, action, date]);

  let lastDay = '';
  return (
    <>
      <PageHead title="Activity" sub="Who did what and when. Chat messages are private and not shown here." />
      <main className="wrap">
        <section className="panel">
          <div className="toolbar">
            <label className="sr-only" htmlFor="who">Person</label>
            <select className="select" id="who" value={userId} onChange={e => setUserId(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">Everyone</option>
              {people.data?.users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.employeeId})</option>)}
            </select>
            <label className="sr-only" htmlFor="what">Kind of activity</label>
            <select className="select" id="what" value={action} onChange={e => setAction(e.target.value)} style={{ maxWidth: 240 }}>
              <option value="">All activity</option>
              {GROUPS.map(([g, list]) => <optgroup key={g} label={g}>{list.map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}</optgroup>)}
            </select>
            <label className="sr-only" htmlFor="day">Day</label>
            <input className="input" id="day" type="date" max={todayIST()} value={date} onChange={e => setDate(e.target.value)} style={{ maxWidth: 180 }} />
            {(userId || action || date) && <button type="button" className="linkbtn" onClick={() => { setUserId(''); setAction(''); setDate(''); }}>Clear filters</button>}
          </div>
          {error ? <ErrorNote error={error} onRetry={() => load()} /> : !items ? <Loading /> : (
            <div className="activity">
              {items.map(a => {
                const day = istDate(a.at);
                const sep = day !== lastDay ? <div className="day-sep" key={`d${a.id}`}><span>{day === todayIST() ? 'Today' : fmtDate(day, true)}</span></div> : null;
                lastDay = day;
                return [sep, (
                  <div className="act-row" key={a.id}>
                    <span className="t">{fmtTime(a.at)}</span>
                    <span className="grow-1"><b>{a.user.name}</b> {(ACTION_LABEL[a.action] ?? a.action).toLowerCase()}{a.detail && a.detail !== ACTION_LABEL[a.action] && <span className="sub">{a.detail}</span>}</span>
                  </div>
                )];
              })}
              {!items.length && <Empty title="Nothing here">Try another person, kind or day.</Empty>}
              {next && <div className="panel-foot" style={{ justifyContent: 'center' }}><button type="button" className="btn ghost" disabled={busy} onClick={() => load(next)}>Show older</button></div>}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
