import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Channel, type ChannelMessage, type ChannelThread, type ChatContact, type ChatMessage, type ChatThread } from '../api';
import { useAuth } from '../lib/auth';
import { errorText, useToast } from '../lib/hooks';
import { fmtDate, fmtTime, initials, istDate, todayIST } from '../lib/format';
import { Empty, ErrorNote, Loading } from '../components/ui';
import { PageHead } from '../components/PageHead';

/**
 * Team chat: channels everyone reads (#general, #team, announcements where only the admin posts)
 * and private one-to-one chats. Addresses: /<role>/chat/c/<channel> and /<role>/chat/<personId>.
 */

/** Fired when messages are read or sent, so the unread badge in the menu updates straight away. */
export const CHAT_CHANGED = 'chat-changed';

// The app asks the server for new messages this often. No extra chat server is needed.
const THREAD_POLL_MS = 4000;
const LIST_POLL_MS = 10000;

/** Unread message count (channels and private) for the Chat badge. */
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
const chatChanged = () => window.dispatchEvent(new Event(CHAT_CHANGED));
const HASH = <span className="hash" aria-hidden="true">#</span>;
const MEGAPHONE = <svg className="hash" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12" /></svg>;
const channelIcon = (c: { adminOnlyPost: boolean }) => (c.adminOnlyPost ? MEGAPHONE : HASH);

/** Messages grouped by day, for the date lines. */
function byDay<T extends { at: string }>(list: T[]) {
  const days: { day: string; items: T[] }[] = [];
  for (const m of list) {
    const day = istDate(m.at);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(m);
  }
  return days;
}
const DaySep = ({ day }: { day: string }) => <div className="day-sep"><span>{day === todayIST() ? 'Today' : fmtDate(day, true)}</span></div>;

export default function ChatPage({ role }: { role: 'admin' | 'bde' }) {
  const params = useParams();
  const id = Number(params.id) || null;
  const channelKey = params.key ?? null;
  const base = `/${role}/chat`;
  const [contacts, setContacts] = useState<ChatContact[] | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [error, setError] = useState('');
  const load = () => Promise.all([api.chat.contacts(), api.chat.channels()])
    .then(([c, ch]) => { setContacts(c.contacts); setChannels(ch.channels); setError(''); })
    .catch(e => setError(errorText(e)));
  useEffect(() => { void load(); }, [id, channelKey]);
  usePoll(load, LIST_POLL_MS, []);

  const open = !!(id || channelKey);
  const thread = channelKey ? <ChannelView key={channelKey} channelKey={channelKey} base={base} onActivity={load} />
    : id ? <Thread key={id} userId={id} base={base} onActivity={load} /> : null;

  return (
    <>
      <PageHead title="Chat" sub="Channels are for the whole team. Private chats are only between the two of you." />
      <main className="wrap">
        <section className={`panel chat-layout${open ? ' has-thread' : ''}`}>
          <div className="chat-list">
            <ChatList channels={channels} contacts={contacts} error={error} base={base} activeId={id} activeKey={channelKey} />
          </div>
          <div className="chat-thread">{thread ?? <Empty title="Choose a channel or a person">Start with #general to talk to the whole team.</Empty>}</div>
        </section>
      </main>
    </>
  );
}

function ChatList({ channels, contacts, error, base, activeId, activeKey }: {
  channels: Channel[] | null; contacts: ChatContact[] | null; error: string; base: string; activeId: number | null; activeKey: string | null;
}) {
  const [q, setQ] = useState('');
  const people = useMemo(() => (contacts ?? []).filter(c =>
    !q || c.user.name.toLowerCase().includes(q.toLowerCase()) || c.user.employeeId.toLowerCase().includes(q.toLowerCase())), [contacts, q]);
  if (error && !contacts) return <ErrorNote error={error} />;
  if (!contacts || !channels) return <Loading />;
  return (
    <div className="contacts">
      <label className="sr-only" htmlFor="chat-q">Search people</label>
      <input className="input" id="chat-q" type="search" placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} />
      {!q && <>
        <div className="list-label">Channels</div>
        <div className="card-list">
          {channels.map(c => (
            <Link key={c.key} className={`list-row person channel${c.key === activeKey ? ' on' : ''}`} to={`${base}/c/${c.key}`} aria-current={c.key === activeKey ? 'true' : undefined}>
              <span className="ch-ico">{channelIcon(c)}</span>
              <span className="grow-1">
                <b>{c.name}{c.adminOnlyPost && <span className="ro-tag">read-only</span>}</b>
                <span className="sub" style={{ display: 'block', whiteSpace: 'nowrap' }}>{c.last ? `${c.last.from.split(' ')[0]}: ${c.last.text}` : c.description}</span>
              </span>
              <span className="end">
                {c.last && <small className="muted">{whenShort(c.last.at)}</small>}
                {c.unread > 0 && <span className="unread" aria-label={`${c.unread} unread`}>{c.unread}</span>}
              </span>
            </Link>
          ))}
        </div>
      </>}
      <div className="list-label">{q ? 'People' : 'Private chats'}</div>
      <div className="card-list">
        {people.map(c => (
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
        {!people.length && <Empty title="No one matches" />}
      </div>
    </div>
  );
}

/** Message box with Send. Enter sends, Shift+Enter makes a new line. */
function Composer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    if (await onSend(body)) setText('');
    setBusy(false);
  }
  return (
    <form className="composer" onSubmit={send}>
      <div className="composer-row">
        <label className="sr-only" htmlFor="chat-text">Message</label>
        <textarea id="chat-text" className="textarea" rows={1} maxLength={1000} placeholder={placeholder} value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button type="submit" className="btn" disabled={busy || !text.trim()}>Send</button>
      </div>
      <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
    </form>
  );
}

function ThreadHead({ base, children }: { base: string; children: ReactNode }) {
  return <div className="thread-head"><Link to={base} className="back-link" aria-label="Back to chats">‹</Link>{children}</div>;
}

/** Keeps a list of messages up to date: first load, then only newer ones every few seconds. */
function useLiveMessages<T extends { messages: { id: number }[] }>(load: (after?: number) => Promise<T>, deps: unknown[], onNew: () => void) {
  const [t, setT] = useState<T | null>(null);
  const [error, setError] = useState('');
  const lastId = t?.messages.at(-1)?.id;
  const merge = (r: T) => setT(prev => {
    if (!prev) return r;
    const known = new Set(prev.messages.map(m => m.id));
    return { ...r, messages: [...prev.messages, ...r.messages.filter(m => !known.has(m.id))] };
  });
  useEffect(() => {
    load().then(r => { setT(r); chatChanged(); onNew(); }).catch(e => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  usePoll(() => {
    if (!t) return;
    load(lastId).then(r => { if (r.messages.length) { chatChanged(); onNew(); } merge(r); }).catch(() => {});
  }, THREAD_POLL_MS, [...deps, lastId, !!t]);
  return { t, setT, error, lastId };
}

function ChannelView({ channelKey, base, onActivity }: { channelKey: string; base: string; onActivity: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { t, setT, error, lastId } = useLiveMessages<ChannelThread>(after => api.chat.channel(channelKey, after), [channelKey], onActivity);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lastId]);

  if (error) return <div className="panel-pad form-col"><ErrorNote error={error} /><Link className="btn ghost" to={base}>‹ Back to chats</Link></div>;
  if (!t) return <Loading />;
  const c = t.channel;

  return (
    <div className="thread">
      <ThreadHead base={base}>
        <span className="ch-ico big">{channelIcon(c)}</span>
        <span><b>{c.name}</b><small className="muted">{c.description}</small></span>
      </ThreadHead>
      <div className="messages feed" aria-live="polite">
        {!t.messages.length && <Empty title={`Nothing in #${c.name} yet`}>{c.canPost ? 'Write the first message.' : 'Announcements from the admin appear here.'}</Empty>}
        {byDay(t.messages).map(d => (
          <div key={d.day}>
            <DaySep day={d.day} />
            {d.items.map((m, i) => {
              // Several messages in a row from one person show their name once
              const prev = d.items[i - 1];
              const grouped = prev && prev.from.id === m.from.id && Date.parse(m.at) - Date.parse(prev.at) < 5 * 60_000;
              return <FeedMessage key={m.id} m={m} grouped={!!grouped} mine={m.from.id === user?.id} />;
            })}
          </div>
        ))}
        <div ref={end} />
      </div>
      {c.canPost
        ? <Composer placeholder={`Message #${c.name}`} onSend={async text => {
            try {
              const r = await api.chat.post(c.key, text);
              setT(prev => (prev ? { ...prev, messages: [...prev.messages, r.message] } : prev));
              onActivity();
              return true;
            } catch (err) { toast(errorText(err)); return false; }
          }} />
        : <p className="small muted composer-off">Only the admin posts in announcements. You'll get a notification for each one.</p>}
    </div>
  );
}

function FeedMessage({ m, grouped, mine }: { m: ChannelMessage; grouped: boolean; mine: boolean }) {
  return (
    <div className={`feed-msg${grouped ? ' grouped' : ''}${mine ? ' mine' : ''}`}>
      {grouped ? <span className="av-space" /> : <span className={`av${m.from.role === 'ADMIN' ? ' admin' : ''}`} aria-hidden="true">{initials(m.from.name)}</span>}
      <div className="feed-body">
        {!grouped && <div className="feed-who"><b>{mine ? 'You' : m.from.name}</b>{m.from.role === 'ADMIN' && <span className="role-tag">Admin</span>}<small>{fmtTime(m.at)}</small></div>}
        <p title={grouped ? fmtTime(m.at) : undefined}>{m.text}</p>
      </div>
    </div>
  );
}

function Thread({ userId, base, onActivity }: { userId: number; base: string; onActivity: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { t, setT, error, lastId } = useLiveMessages<ChatThread>(after => api.chat.thread(userId, after), [userId], onActivity);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lastId]);

  if (error) return <div className="panel-pad form-col"><ErrorNote error={error} /><Link className="btn ghost" to={base}>‹ Back to chats</Link></div>;
  if (!t) return <Loading />;

  const other = t.with;
  const lastMine = [...t.messages].reverse().find(m => m.from === user?.id);

  return (
    <div className="thread">
      <ThreadHead base={base}>
        <span className={`av${other.role === 'ADMIN' ? ' admin' : ''}`} aria-hidden="true">{initials(other.name)}</span>
        <span><b>{other.name}</b><small className="muted">{other.role === 'ADMIN' ? 'Admin' : other.employeeId}. Private chat.</small></span>
      </ThreadHead>
      <div className="messages" aria-live="polite">
        {!t.messages.length && <Empty title={`Say hello to ${other.name.split(' ')[0]}`}>Messages are private between the two of you.</Empty>}
        {byDay<ChatMessage>(t.messages).map(d => (
          <div key={d.day}>
            <DaySep day={d.day} />
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
      {other.active
        ? <Composer placeholder={`Message ${other.name.split(' ')[0]}`} onSend={async text => {
            try {
              const r = await api.chat.send(userId, text);
              setT(prev => (prev ? { ...prev, messages: [...prev.messages, r.message] } : prev));
              onActivity();
              return true;
            } catch (err) { toast(errorText(err)); return false; }
          }} />
        : <p className="small muted composer-off">{other.name}'s account is deactivated, so you can't reply.</p>}
    </div>
  );
}
