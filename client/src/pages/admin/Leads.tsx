import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Stage } from '../../api';
import { download, errorText, useLoad, useToast } from '../../lib/hooks';
import { STAGES, STAGE_LABEL, fmtDate, istDate, rupee } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Loading, Modal, SourceTag } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { ImportLeads } from './ImportLeads';
import { Imports } from './Imports';
import { SheetUpdate } from '../../components/SheetUpdate';

export default function Leads() {
  const [params] = useSearchParams();
  const [stage, setStage] = useState<Stage | ''>('');
  const [owner, setOwner] = useState('');
  const [q, setQ] = useState('');
  const [overdue, setOverdue] = useState(params.get('view') === 'overdue');
  const [openId, setOpenId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [updating, setUpdating] = useState(false);
  // "leads" = the list; "imports" = each import's progress
  const [tab, setTab] = useState<'leads' | 'imports'>(params.get('tab') === 'imports' ? 'imports' : 'leads');
  const [batch, setBatch] = useState<{ id: number; name: string } | null>(null);
  const bdes = useLoad(() => api.users.list({ status: 'active' }));
  const { data, error, reload } = useLoad(
    () => api.leads.list({ view: overdue ? 'overdue' : 'all', stage: stage || undefined, ownerId: owner ? Number(owner) : undefined, q: q.trim() || undefined, batchId: batch?.id }),
    [stage, owner, q, overdue, batch?.id]);
  const total = data ? Object.values(data.counts.byStage).reduce((a, b) => a + b, 0) : 0;

  const clear = () => { setStage(''); setOwner(''); setQ(''); setOverdue(false); setBatch(null); };

  return (
    <>
      <PageHead title="Leads" />
      <main className="wrap">
        <section className="panel">
          <div className="panel-head">
            <div className="seg" role="group" aria-label="Show">
              <button type="button" aria-pressed={tab === 'leads'} onClick={() => setTab('leads')}>{data ? `${data.leads.length} lead${data.leads.length === 1 ? '' : 's'}` : 'Leads'}</button>
              <button type="button" aria-pressed={tab === 'imports'} onClick={() => setTab('imports')}>Imports</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn ghost" onClick={() => setImporting(true)}>Import from Excel</button>
              <button type="button" className="btn ghost" onClick={() => setUpdating(true)}>Update from Excel</button>
              <button type="button" className="btn ghost" onClick={() => download(api.exports.leads())}>Download Excel</button>
            </div>
          </div>
          {tab === 'imports' ? <Imports onOpenBatch={b => { clear(); setBatch({ id: b.id, name: b.fileName }); setTab('leads'); }} /> : <>
          {batch && <div className="toolbar batch-bar"><span>Showing the import <b>{batch.name}</b></span><button type="button" className="linkbtn" onClick={() => setBatch(null)}>Show all leads</button></div>}
          <div className="toolbar">
            <div className="chips" role="group" aria-label="Status">
              <button type="button" className="chip" aria-pressed={stage === ''} onClick={() => setStage('')}>All {data && <b>{total}</b>}</button>
              {STAGES.map(s => <button key={s} type="button" className="chip" aria-pressed={stage === s} onClick={() => setStage(s)}>{STAGE_LABEL[s]} {data && <b>{data.counts.byStage[s]}</b>}</button>)}
            </div>
          </div>
          <div className="toolbar">
            <label className="sr-only" htmlFor="q">Search leads</label>
            <input className="input search" id="q" type="search" placeholder="Search candidate or phone" value={q} onChange={e => setQ(e.target.value)} />
            <label className="sr-only" htmlFor="owner">BDE</label>
            <select className="select" id="owner" value={owner} onChange={e => setOwner(e.target.value)}>
              <option value="">All BDEs</option>
              {bdes.data?.users.map(b => <option key={b.id} value={b.id}>{b.name} ({b.employeeId})</option>)}
            </select>
            <button type="button" className="chip" aria-pressed={overdue} onClick={() => setOverdue(o => !o)}>Overdue only {data && <b>{data.counts.overdue}</b>}</button>
            <span className="spacer" />
            <button type="button" className="linkbtn" onClick={clear}>Clear filters</button>
          </div>
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
            <div className="scroll">
              <table className="data">
                <thead><tr><th scope="col">Candidate</th><th scope="col">Course</th><th scope="col">BDE</th><th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Next action</th></tr></thead>
                <tbody>
                  {data.leads.map(l => (
                    <tr key={l.id} className="click" tabIndex={0} onClick={() => setOpenId(l.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(l.id); }}>
                      <td className="who"><b>{l.name}</b><small>{l.phone}</small></td>
                      <td>{l.course.name}</td>
                      <td>{l.owner.name}</td>
                      <td><Badge label={STAGE_LABEL[l.stage]} /></td>
                      <td>{l.followUpOn ? <Due date={l.followUpOn} /> : <span className="muted">–</span>}</td>
                      <td style={{ maxWidth: 280 }}>{l.nextAction ?? <span className="muted">–</span>}</td>
                    </tr>
                  ))}
                  {!data.leads.length && <tr><td colSpan={6}><Empty title="No leads match these filters"><button type="button" className="linkbtn" onClick={clear}>Clear filters</button></Empty></td></tr>}
                </tbody>
              </table>
            </div>
          )}
          </>}
        </section>
      </main>
      <ImportLeads open={importing} onClose={() => setImporting(false)} onDone={() => { setImporting(false); setTab('imports'); void reload(); }} />
      <SheetUpdate open={updating} onClose={() => setUpdating(false)} onDone={() => { setUpdating(false); void reload(); }}
        filter={{ ownerId: owner ? Number(owner) : undefined, batchId: batch?.id }} />
      <LeadDrawer id={openId} bdes={bdes.data?.users ?? []} onClose={() => setOpenId(null)} onSaved={reload} />
    </>
  );
}

function LeadDrawer({ id, bdes, onClose, onSaved }: { id: number | null; bdes: { id: number; name: string; employeeId: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data } = useLoad(() => (id ? api.leads.get(id) : Promise.resolve(null)), [id]);
  const [stage, setStage] = useState<Stage>('INTERESTED');
  const [owner, setOwner] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setStage(data.lead.stage); setOwner(data.lead.owner.id); setErr(''); } }, [data]);

  async function save() {
    if (!data || !id) return;
    const body: { stage?: Stage; ownerId?: number } = {};
    if (stage !== data.lead.stage) body.stage = stage;
    if (owner !== data.lead.owner.id) body.ownerId = owner;
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    try {
      await api.leads.update(id, body);
      toast(`${data.lead.name}: saved`);
      onClose(); onSaved();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  const l = data?.lead;
  return (
    <Modal open={id !== null} title={l?.name ?? 'Lead'} onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy || !data}>Save changes</button></>}>
      {!data || !l ? <Loading /> : (
        <>
          <div className="info-grid">
            {([['Phone', <a href={`tel:+${l.phone.replace(/\D/g, '')}`}>{l.phone}</a>], ['Course', l.course.name], ['Fee', rupee(data.money.fee)],
              ['Balance', rupee(data.money.balance)], ['Follow-up', l.followUpOn ? <Due date={l.followUpOn} /> : '–'], ['Next action', l.nextAction ?? '–']] as const)
              .map(([k, v]) => <div key={k}><div className="muted">{k}</div><div>{v}</div></div>)}
          </div>
          <label className="field">Status
            <select className="select" value={stage} onChange={e => setStage(e.target.value as Stage)}>
              {/* These two follow a booked interview and a verified fee, so they can't be picked by hand */}
              {STAGES.map(s => <option key={s} value={s} disabled={(s === 'PAID' || s === 'INTERVIEW_SCHEDULED' || s === 'NEW') && s !== l.stage}>{STAGE_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">Assigned BDE
            <select className="select" value={owner} onChange={e => setOwner(Number(e.target.value))}>
              {!bdes.some(b => b.id === l.owner.id) && <option value={l.owner.id}>{l.owner.name}</option>}
              {bdes.map(b => <option key={b.id} value={b.id}>{b.name} ({b.employeeId})</option>)}
            </select>
          </label>
          <div>
            <div className="h3">Notes</div>
            <div className="timeline">
              {data.notes.map(n => <div className="t" key={n.id}><span className="when">{fmtDate(istDate(n.createdAt))}</span><span>{n.text} <small className="muted">({n.author})</small> <SourceTag source={n.source} /></span></div>)}
            </div>
          </div>
          {err && <span className="err" role="alert">{err}</span>}
        </>
      )}
    </Modal>
  );
}
