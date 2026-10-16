import { useEffect, useRef, type ReactNode } from 'react';
import { badgeClass, dueInfo } from '../lib/format';

/** Where a change was made: the call list on Today, an Excel upload or an import. Changes on the lead page have no tag. */
const SOURCE_LABEL: Record<string, string> = { CALL: 'Call list', SHEET: 'Excel', IMPORT: 'Import' };
export function SourceTag({ source }: { source: string }) {
  return SOURCE_LABEL[source] ? <span className={`src-tag src-${source.toLowerCase()}`}>{SOURCE_LABEL[source]}</span> : null;
}

export function Badge({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return <span className={`badge ${badgeClass(label)}`}>{label}</span>;
}

export function Due({ date }: { date: string | null | undefined }) {
  const d = dueInfo(date);
  return d ? <span className={d.cls}>{d.text}</span> : <span className="muted">–</span>;
}

/** Summary strip: up to four numbers at the top of a page. */
export function StatStrip({ items }: { items: { name: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <div className="score">
      {items.map(i => (
        <div className="cell" key={i.name}>
          <span className="name">{i.name}</span>
          <span className="big">{i.value}</span>
          {i.sub ? <span className="of">{i.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function Loading() {
  return <div className="empty" aria-busy="true">Loading…</div>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <b>Couldn't load this</b>{error}
      {onRetry && <div><button type="button" className="linkbtn" onClick={onRetry}>Try again</button></div>}
    </div>
  );
}

const X = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

/** Dialog using the browser's <dialog>, so focus and Esc work out of the box. */
export function Modal({ open, title, onClose, children, footer, wide, onSubmit }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const body = (
    <>
      <div className="modal-head"><h2>{title}</h2><button type="button" className="x" onClick={onClose} aria-label="Close">{X}</button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </>
  );
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''}`} onClose={onClose} onCancel={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }} aria-label={title}>
      {open && (onSubmit
        ? <form noValidate onSubmit={e => { e.preventDefault(); onSubmit(); }}>{body}</form>
        : body)}
    </dialog>
  );
}

export const Icons = {
  phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>,
  plus: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>,
  image: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>,
  upload: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>,
  plusSm: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>,
};
