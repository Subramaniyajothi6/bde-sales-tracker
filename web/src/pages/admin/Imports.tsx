import { Fragment, useState } from 'react';
import { api, type ImportBatch, type Stage, type StageCounts } from '../../api';
import { useLoad } from '../../lib/hooks';
import { STAGE_LABEL, fmtDate, istDate } from '../../lib/format';
import { Empty, ErrorNote, Loading } from '../../components/ui';

/** The order a student moves through, left to right, for the progress columns. */
const FLOW: Stage[] = ['NEW', 'INTERESTED', 'FOLLOW_UP', 'INTERVIEW_SCHEDULED', 'SELECTED', 'PAYMENT_COMMITTED', 'PAID', 'NOT_INTERESTED'];
const SHORT: Record<Stage, string> = {
  NEW: 'Not called', INTERESTED: 'Interested', FOLLOW_UP: 'Follow-up', INTERVIEW_SCHEDULED: 'Interview',
  SELECTED: 'Selected', PAYMENT_COMMITTED: 'Committed', PAID: 'Paid', NOT_INTERESTED: 'Not interested'
};

/** Each import of students and how far they have got, overall and per BDE. Click a batch to see its leads. */
export function Imports({ onOpenBatch }: { onOpenBatch: (b: ImportBatch) => void }) {
  const { data, error, reload } = useLoad(() => api.leads.batches());
  const [openId, setOpenId] = useState<number | null>(null);
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.batches.length) return <Empty title="No imports yet">Use "Import from Excel" to add a list of students. Each import shows up here so you can follow it.</Empty>;

  const cells = (s: StageCounts, total: number) => FLOW.map(st => (
    <td key={st} className={`num flow-${st.toLowerCase()}`} title={`${STAGE_LABEL[st]}: ${s[st]}`}>
      {s[st] ? <>{s[st]}<small className="muted"> {Math.round((s[st] / (total || 1)) * 100)}%</small></> : <span className="muted">0</span>}
    </td>
  ));
  return (
    <div className="scroll">
      <table className="data imports">
        <thead><tr>
          <th scope="col">Import</th><th scope="col" className="num">Students</th><th scope="col" className="num">Called</th>
          {FLOW.map(st => <th key={st} scope="col" className="num">{SHORT[st]}</th>)}
          <th scope="col"><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {data.batches.map(b => {
            const total = Object.values(b.stages).reduce((a, c) => a + c, 0);
            return (
              <Fragment key={b.id}>
                <tr>
                  <td className="who"><b>{b.fileName}</b><small>{fmtDate(istDate(b.createdAt))}, by {b.createdBy}, {b.byBde.length} BDE{b.byBde.length === 1 ? '' : 's'}</small></td>
                  <td className="num"><b>{total}</b></td>
                  <td className="num">{b.called}<small className="muted"> of {total}</small></td>
                  {cells(b.stages, total)}
                  <td><div className="row-acts">
                    <button type="button" className="linkbtn" onClick={() => setOpenId(openId === b.id ? null : b.id)} aria-expanded={openId === b.id}>{openId === b.id ? 'Hide BDEs' : 'By BDE'}</button>
                    <button type="button" className="btn ghost sm" onClick={() => onOpenBatch(b)}>See leads</button>
                  </div></td>
                </tr>
                {openId === b.id && b.byBde.map(x => {
                  const t = Object.values(x.stages).reduce((a, c) => a + c, 0);
                  return (
                    <tr key={`${b.id}-${x.bde.id}`} className="sub-row">
                      <td className="who"><span className="muted">↳</span> {x.bde.name}</td>
                      <td className="num">{t}</td><td />
                      {cells(x.stages, t)}
                      <td />
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
