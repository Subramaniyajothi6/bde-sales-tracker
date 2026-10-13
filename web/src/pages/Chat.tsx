import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type ChatContact, type ChatMessage, type ChatThread } from '../api';
import { useAuth } from '../lib/auth';
import { errorText, useToast } from '../lib/hooks';
import { fmtDate, fmtTime, initials, istDate, todayIST } from '../lib/format';
import { Empty, ErrorNote, Loading } from '../components/ui';
import { PageHead } from '../components/PageHead';

/** Fired when messages are read or sent, so the unread badge in the menu updates straight away. */
export const CHAT_CHANGED = 'chat-changed';

// The app asks the server for new messages this often. No extra chat server is needed.
const THREAD_POLL_MS = 4000;
const LIST_POLL_MS = 10000;

/** Unread message count for the Chat badge. */
export function useUnreadChat() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api.chat.unread().then(r => alive && setCount(r.count)).catch(() => {});
    load();
    const t = window.setInterval(load, 20000);
    window.addEventListener(CHAT_CHANGED, load);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener(CHAT_CHANGED, load); };
  }, []);
  return count;
}

/** Repeats fn every ms while the tab is visible. */
function usePoll(fn: () => void, ms: number, deps: unknown[]) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') ref.current(); }, ms);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const whenShort = (iso: string) => (istDate(iso) === todayIST() ? fmtTime(iso) : fmtDate(istDate(iso)));

export default function ChatPage({ role }: { role: 'admin' | 'bde' }) {
  const id = Number(useParams().id) || null;
  const base = `/${role}/chat`;
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [error, setError] = useState('');
  const load = () => api.chat.contacts().then(r => { setContacts(r.contacts); setError(''); }).catch(e => setError(errorText(e)));
  useEffect(() => { void load(); }, [id]);
  usePoll(load, LIST_POLL_MS, []);

  const list = <Contacts contacts={contacts} error={error} base={base} activeId={id} />;
  const thread = id ? <Thread key={id} userId={id} base={base} onActivity={load} /> : null;

  return (
    <>
      <PageHead title="Chat" sub={role === 'bde' ? 'Message your admin or another BDE. Only the two of you can see a chat.' : undefined} />
      <main className="wrap">
        <section className={`panel chat-layout${id ? ' has-thread' : ''}`}>
          <div className="chat-list">{list}</div>
          <div className="chat-thread">{thread ?? <Empty title="Choose someone to chat with">Messages are private between the two of you.</Empty>}</div>
        </section>
      </main>
    </>
  );
}

function Contacts({ contacts, error, base, activeId }: { contacts: ChatContact[] | null; error: string; base: string; activeId: number | null }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => (contacts ?? []).filter(c =>
    !q || c.user.name.toLowerCase().includes(q.toLowerCase()) || c.user.employeeId.toLowerCase().includes(q.toLowerCase())), [contacts, q]);
  return (
    <div className="contacts">
      <label className="sr-only" htmlFor="chat-q">Find a person</label>
      <input className="input" id="chat-q" type="search" placeholder="Find a person" value={q} onChange={e => setQ(e.target.value)} />
      <div className="card-list">
        {error && !contacts ? <ErrorNote error={error} /> : !contacts ? <Loading /> : shown.map(c => (
          <Link key={c.user.id} className={`list-row person${c.user.id === activeId ? ' on' : ''}`} to={`${base}/${c.user.id}`} aria-current={c.user.id === activeId ? 'true' : undefined}>
            <span className={`av${c.user.role === 'ADMIN' ? ' admin' : ''}`} aria-hidden="true">{initials(c.user.name)}</span>
            <span className="grow-1">
              <b>{c.user.name}{c.user.role === 'ADMIN' && <span className="role-tag">Admin</span>}</b>
              <span className="sub" style={{ display: 'block', whiteSpace: 'nowrap' }}>{c.last ? `${c.last.mine ? 'You: ' : ''}${c.last.text}` : c.user.employeeId}</span>
            </span>
            <span className="end">
              {c.last && <small className="muted">{whenShort(c.last.at)}</small>}
              {c.unread > 0 && <span className="unread" aria-label={`${c.unread} unread`}>{c.unread}</span>}
            </span>
          </Link>
        ))}
        {contacts && !shown.length && <Empty title="No one matches" />}
      </div>
    </div>
  );
}

function Thread({ userId, base, onActivity }: { userId: number; base: string; onActivity: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [t, setT] = useState<ChatThread | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const lastId = t?.messages.at(-1)?.id;

  const merge = (r: ChatThread) => setT(prev => {
    if (!prev) return r;
    const known = new Set(prev.messages.map(m => m.id));
    return { ...r, messages: [...prev.messages, ...r.messages.filter(m => !known.has(m.id))] };
  });

  useEffect(() => {
    api.chat.thread(userId).then(r => { setT(r); window.dispatchEvent(new Event(CHAT_CHANGED)); onActivity(); }).catch(e => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  usePoll(() => {
    if (!t) return;
    api.chat.thread(userId, lastId).then(r => {
      if (r.messages.length) { window.dispatchEvent(new Event(CHAT_CHANGED)); onActivity(); }
      merge(r);
    }).catch(() => {});
  }, THREAD_POLL_MS, [userId, lastId, !!t]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lastId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await api.chat.send(userId, body);
      setText('');
      setT(prev => (prev ? { ...prev, messages: [...prev.messages, r.message] } : prev));
      onActivity();
    } catch (err) { toast(errorText(err)); } finally { setBusy(false); }
  }

  if (error) return <div className="panel-pad form-col"><ErrorNote error={error} /><Link className="btn ghost" to={base}>‹ Back to chats</Link></div>;
  if (!t) return <Loading />;

  const other = t.with;
  const lastMine = [...t.messages].reverse().find(m => m.from === user?.id);
  const days: { day: string; items: ChatMessage[] }[] = [];
  for (const m of t.messages) {
    const day = istDate(m.at);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(m);
  }

  const head = (
    <div className="thread-head">
      <Link to={base} className="back-link" aria-label="Back to chats">‹</Link>
      <span className={`av${other.role === 'ADMIN' ? ' admin' : ''}`} aria-hidden="true">{initials(other.name)}</span>
      <span><b>{other.name}</b><small className="muted">{other.role === 'ADMIN' ? 'Admin' : other.employeeId}</small></span>
    </div>
  );

  return (
    <div className="thread">
      {head}
      <div className="messages" aria-live="polite">
        {!t.messages.length && <Empty title={`Say hello to ${other.name.split(' ')[0]}`}>Messages are private between the two of you.</Empty>}
        {days.map(d => (
          <div key={d.day}>
            <div className="day-sep"><span>{d.day === todayIST() ? 'Today' : fmtDate(d.day, true)}</span></div>
            {d.items.map(m => (
              <div key={m.id} className={`msg ${m.from === user?.id ? 'mine' : 'theirs'}`}>
                <p>{m.text}</p>
                <small>{fmtTime(m.at)}{m === lastMine && t.seenUpTo !== null && m.id <= t.seenUpTo ? ', seen' : ''}</small>
              </div>
            ))}
          </div>
        ))}
        <div ref={end} />
      </div>
      {other.active ? (
        <form className="composer" onSubmit={send}>
          <label className="sr-only" htmlFor="chat-text">Message</label>
          <textarea id="chat-text" className="textarea" rows={1} maxLength={1000} placeholder="Type a message" value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e); } }} />
          <button type="submit" className="btn" disabled={busy || !text.trim()}>Send</button>
        </form>
      ) : <p className="small muted composer-off">{other.name}'s account is deactivated, so you can't reply.</p>}
    </div>
  );
}
