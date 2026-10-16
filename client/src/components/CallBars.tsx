import { todayIST } from '../lib/format';

/** Calls each day as bars, with a dashed target line. Today is shown darker. */
export function CallBars({ days, target }: { days: { date: string; calls: number }[]; target: number }) {
  const max = Math.max(target * 1.25, ...days.map(d => d.calls));
  const today = todayIST();
  if (!days.length) return <p className="muted small">No working days yet this month.</p>;
  return (
    <div className="bars-wrap">
      <div className="bars">
        {days.map(d => (
          <div className="col" key={d.date} title={`${d.date}: ${d.calls} calls`}>
            <small style={{ fontWeight: 500, fontSize: 11, color: 'var(--soft)' }}>{d.calls}</small>
            <div className={`bar ${d.date === today ? 'today' : d.calls < target ? 'miss' : ''}`} style={{ height: Math.max(2, (d.calls / max) * 100) }} />
            <span className="lbl">{Number(d.date.slice(8))}</span>
          </div>
        ))}
      </div>
      <div className="target" style={{ bottom: 23 + (target / max) * 100 }}><span>{target}</span></div>
    </div>
  );
}
