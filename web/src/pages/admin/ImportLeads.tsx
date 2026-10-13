import { useState } from 'react';
import { api, type ImportResult } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { rupee } from '../../lib/format';
import { Icons, Modal } from '../../components/ui';

/**
 * Import a sheet of candidates as "New" leads for one BDE.
 * Step 1 checks the file and shows what will happen; step 2 saves.
 */
export function ImportLeads({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const bdes = useLoad(() => api.users.list({ status: 'active' }));
  const courses = useLoad(() => api.courses.list());
  const [file, setFile] = useState<File | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setFile(null); setCheck(null); setErr(''); };
  const close = () => { reset(); onClose(); };
  const changed = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setCheck(null); setErr(''); };

  async function run(commit: boolean) {
    if (!file) return setErr('Choose the Excel or CSV file.');
    if (!ownerId) return setErr('Choose which BDE gets these leads.');
    if (!courseId) return setErr('Choose a course for rows that don\'t name one.');
    setBusy(true);
    try {
      const r = await api.leads.importFile(file, Number(ownerId), Number(courseId), commit);
      if (commit) {
        toast(`${r.created} leads added for ${r.owner.name}`);
        reset();
        onDone();
      } else setCheck(r);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} wide title="Import leads from Excel" onClose={close} onSubmit={() => run(!!check)}
      footer={<>
        <button type="button" className="btn ghost" onClick={close}>Cancel</button>
        {check
          ? <button type="submit" className="btn" disabled={busy || !check.ready}>{busy ? 'Importing…' : `Import ${check.ready} lead${check.ready === 1 ? '' : 's'}`}</button>
          : <button type="submit" className="btn" disabled={busy}>{busy ? 'Checking…' : 'Check the file'}</button>}
      </>}>
      <p className="small muted" style={{ margin: 0 }}>
        The sheet needs a column of mobile numbers. A header row with <b>Name</b>, <b>Phone</b> and (optional) <b>Course</b> works best.
        Each number becomes a <b>New</b> lead in the BDE's "Call today" list. Numbers that are already leads are skipped.
      </p>
      <div className="upload">
        <label style={{ gridColumn: '1 / -1' }}>
          <input type="file" accept=".xlsx,.csv" onChange={e => changed(setFile)(e.target.files?.[0] ?? null)} />
          {Icons.upload}{file ? file.name : 'Choose an .xlsx or .csv file'}
        </label>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <label className="field">Give the leads to
          <select className="select" value={ownerId} onChange={e => changed(setOwnerId)(e.target.value)}>
            <option value="">Choose a BDE…</option>
            {bdes.data?.users.map(b => <option key={b.id} value={b.id}>{b.name} ({b.employeeId})</option>)}
          </select>
        </label>
        <label className="field">Course, if the row doesn't say
          <select className="select" value={courseId} onChange={e => changed(setCourseId)(e.target.value)}>
            <option value="">Choose…</option>
            {courses.data?.courses.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name} ({rupee(c.fee)})</option>)}
          </select>
        </label>
      </div>

      {check && (
        <div className="import-check">
          <p style={{ margin: 0 }}>
            <b>{check.rows}</b> rows found. <b className="ok-text">{check.ready} ready to import</b>
            {check.skippedCount > 0 && <>, <b className="warn-text">{check.skippedCount} will be skipped</b></>}.
            {!check.columns.name && ' No name column was found, so names show as "No name".'}
          </p>
          {check.preview.length > 0 && (
            <div className="scroll">
              <table className="data compact">
                <thead><tr><th scope="col">Row</th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Course</th></tr></thead>
                <tbody>{check.preview.map(p => <tr key={p.row}><td className="muted">{p.row}</td><td>{p.name}</td><td>{p.phone}</td><td>{p.course}</td></tr>)}</tbody>
              </table>
              {check.ready > check.preview.length && <p className="small muted" style={{ margin: '6px 0 0' }}>and {check.ready - check.preview.length} more</p>}
            </div>
          )}
          {check.skipped.length > 0 && (
            <details>
              <summary>See the {check.skippedCount} skipped rows</summary>
              <ul className="skipped">{check.skipped.map(s => <li key={s.row}>Row {s.row}: {s.name} {s.phone && `(${s.phone})`}, <span className="muted">{s.reason}</span></li>)}</ul>
            </details>
          )}
        </div>
      )}
      {err && <span className="err" role="alert">{err}</span>}
    </Modal>
  );
}
