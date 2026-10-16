import { useState } from 'react';
import { api, type SheetResult } from '../api';
import { download, errorText, useToast } from '../lib/hooks';
import { Icons, Modal } from './ui';

/**
 * Update many leads at once from a sheet (BDE: their own leads; admin: any).
 * 1. download the sheet, 2. fill in the green columns, 3. upload: see every change and
 * every row that can't be applied, then apply.
 */
export function SheetUpdate({ open, onClose, onDone, filter }: {
  open: boolean; onClose: () => void; onDone: () => void;
  /** Admin only: which leads go in the sheet */
  filter?: { ownerId?: number; batchId?: number };
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<SheetResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = () => { setFile(null); setCheck(null); setErr(''); };
  const close = () => { reset(); onClose(); };

  async function run(commit: boolean) {
    if (!file) return setErr('Choose the filled-in sheet.');
    setBusy(true);
    try {
      const r = await api.leads.uploadSheet(file, commit);
      if (commit) {
        toast(r.added ? `${r.applied - r.added} updated, ${r.added} new student${r.added === 1 ? '' : 's'} added` : `${r.applied} lead${r.applied === 1 ? '' : 's'} updated`);
        reset();
        onDone();
      } else setCheck(r);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} wide title="Update leads from Excel" onClose={close} onSubmit={() => run(!!check)}
      footer={<>
        <button type="button" className="btn ghost" onClick={close}>Cancel</button>
        {check
          ? <button type="submit" className="btn" disabled={busy || !check.changed}>{busy ? 'Saving…' : `Apply ${check.changed} change${check.changed === 1 ? '' : 's'}`}</button>
          : <button type="submit" className="btn" disabled={busy || !file}>{busy ? 'Checking…' : 'Check the sheet'}</button>}
      </>}>
      <ol className="sheet-steps">
        <li>
          <b>Download the sheet</b> with your open leads.
          <button type="button" className="btn ghost sm" onClick={() => download(api.leads.sheetUrl({ view: 'active', ...filter }))}>Download Excel</button>
        </li>
        <li>
          <b>Fill in the green columns:</b> Status, Follow-up date, Next action, Book interview on and Interview time,
          Attended? (Yes or No), Result (Selected or Not selected), Add a note. Leave a cell as it is to keep it.
          <br /><b>New students you called:</b> add a row at the bottom with no Lead ID. Fill in Candidate, Phone, Course and Status{filter ? ', and BDE (e.g. BDE-014)' : ''}; the follow-up is tomorrow unless you give a date.
        </li>
        <li>
          <b>Upload it here.</b> You see every change before anything is saved.
          <div className="upload" style={{ marginTop: 8 }}>
            <label style={{ gridColumn: '1 / -1' }}>
              <input type="file" accept=".xlsx,.csv" onChange={e => { setFile(e.target.files?.[0] ?? null); setCheck(null); setErr(''); }} />
              {Icons.upload}{file ? file.name : 'Choose the filled-in sheet'}
            </label>
          </div>
        </li>
      </ol>

      {check && (
        <div className="import-check">
          <p style={{ margin: 0 }}>
            <b>{check.rows}</b> rows. <b className="ok-text">{check.changed} will change</b>{check.added > 0 && <> (including <b>{check.added} new student{check.added === 1 ? '' : 's'}</b>)</>}
            {check.problems > 0 && <>, <b className="warn-text">{check.problems} can't be applied</b></>}, {check.unchanged} unchanged.
          </p>
          {check.items.length > 0 && (
            <div className="scroll">
              <table className="data compact">
                <thead><tr><th scope="col">Row</th><th scope="col">Lead</th><th scope="col">What happens</th></tr></thead>
                <tbody>
                  {check.items.map(it => (
                    <tr key={it.row} className={it.errors.length ? 'row-problem' : undefined}>
                      <td className="muted">{it.row}</td>
                      <td><b>{it.name}</b>{it.leadId ? <small className="muted"> L-{it.leadId}</small> : <small className="muted"> new</small>}</td>
                      <td>{it.errors.length
                        ? <span className="warn-text">Not applied: {it.errors.join('; ')}</span>
                        : <ul className="change-list">{it.changes.map(c => <li key={c}>{c}</li>)}</ul>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {check.problems > 0 && <p className="small muted" style={{ margin: 0 }}>Rows that can't be applied are left as they are. Fix them in the sheet and upload again any time.</p>}
        </div>
      )}
      {err && <span className="err" role="alert">{err}</span>}
    </Modal>
  );
}
