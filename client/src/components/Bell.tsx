import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Notice } from '../api';
import { fmtDate, fmtTime, istDate, todayIST } from '../lib/format';

/** Ask the server for the unread count this often. */
const POLL_MS = 30000;

const when = (iso: string) => (istDate(iso) === todayIST() ? fmtTime(iso) : fmtDate(istDate(iso)));

/** The bell: unread count on the icon, and the latest notifications in a box below it. */
export function Bell() {
  const nav = useNavigate();
  const btn = useRef<HTMLButtonElement>(null);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    let alive = true;
    const load = () => { if (document.visibilityState === 'visible') api.notifications.unread().then(r => alive && setCount(r.count)).catch(() => {}); };
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function toggle() {
    if (open) return setOpen(false);
    // Place the box under the bell, kept inside the screen
    const r = btn.current!.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 16);
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    setOpen(true);
    setItems(null);
    api.notifications.list().then(r => { setItems(r.items); setCount(r.unread); }).catch(() => setItems([]));
  }

  async function go(n: Notice) {
    setOpen(false);
    if (!n.read) { setCount(c => Math.max(0, c - 1)); void api.notifications.read([n.id]); }
    if (n.link) nav(n.link);
  }
  async function readAll() {
    await api.notifications.read();
    setCount(0);
    setItems(list => list?.map(n => ({ ...n, read: true })) ?? null);
  }

  return (
    <>
      <button ref={btn} type="button" className={`bell-btn${open ? ' on' : ''}`} onClick={toggle} aria-expanded={open}
        aria-label={count ? `Notifications, ${count} new` : 'Notifications'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && <span className="bell-count" aria-hidden="true">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && <>
        <div className="bell-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
        <div className="bell-box" role="dialog" aria-label="Notifications" style={{ top: pos.top, left: pos.left }}>
          <div className="bell-head"><b>Notifications</b>{items?.some(n => !n.read) && <button type="button" className="linkbtn" onClick={readAll}>Mark all as read</button>}</div>
          <div className="bell-list">
            {!items ? <div className="empty">Loading…</div> : items.map(n => (
              <button key={n.id} type="button" className={`bell-item${n.read ? '' : ' new'}`} onClick={() => go(n)}>
                <span className="bell-dot" aria-hidden="true" />
                <span className="bell-text">{n.title}<small>{when(n.at)}</small></span>
              </button>
            ))}
            {items && !items.length && <div className="empty"><b>No notifications yet</b>You'll see leave answers, receipts and announcements here.</div>}
          </div>
        </div>
      </>}
    </>
  );
}
