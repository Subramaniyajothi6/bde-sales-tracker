import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, type Stage } from '../../api';
import { errorText, useLoad, useToast } from '../../lib/hooks';
import { STAGES, STAGE_LABEL, addDays, rupee, todayIST } from '../../lib/format';
import { Badge, Due, Empty, ErrorNote, Icons, Loading, Modal } from '../../components/ui';

type View = 'due' | 'active' | 'all';

export default function Leads() {
  const [params, setParams] = useSearchParams();
  const view = (['due', 'active', 'all'].includes(params.get('view') ?? '') ? params.get('view') : 'active') as View;
  const [q, setQ] = useState('');
  const { data, error, reload } = useLoad(() => api.leads.list({ view, q: q.trim() || undefined }), [view, q]);
  const [adding, setAdding] = useState(params.get('add') === '1');

  const setView = (v: View) => setParams(p => { p.set('view', v); p.delete('add'); return p; }, { replace: true });
  const chips: [View, string, number | undefined][] = [
    ['due', 'Call today', data?.counts.due], ['active', 'Active', data?.counts.active],
    ['all', 'All', data ? Object.values(data.counts.byStage).reduce((a, b) => a + b, 0) : undefined]
  ];

  return (
    <>
      <section className="bde-head">
        <h1>My leads</h1>
        <p>{data ? `${data.counts.due} to call today` : ' '}</p>
      </section>
      <main className="bde-main">
        <label className="sr-only" htmlFor="q">Search my leads</label>
        <input className="input" id="q" type="search" placeholder="Search name or phone" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips" role="group" aria-label="Show">
          {chips.map(([k, label, n]) => (
            <button key={k} type="button" className="chip" aria-pressed={view === k} onClick={() => setView(k)}>{label} {n !== undefined && <b>{n}</b>}</button>
          ))}
        </div>
        <div className="card-list">
          {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : data.leads.map(l => (
            <Link className="list-row" to={`/bde/leads/${l.id}`} key={l.id}>
              <span className="grow-1"><b>{l.name}</b>{l.nextAction && <span className="sub" style={{ display: 'block' }}>{l.nextAction}</span>}</span>
              <span className="end"><Badge label={STAGE_LABEL[l.stage]} />{l.followUpOn && <Due date={l.followUpOn} />}</span>
            </Link>
          ))}
          {data && !data.leads.length && <Empty title={view === 'due' ? 'Nothing due right now' : 'No leads here'}>{view === 'due' ? '' : 'Tap + to add a candidate.'}</Empty>}
        </div>
      </main>
      <button type="button" className="fab" aria-label="Add a lead" onClick={() => setAdding(true)}>{Icons.plus}</button>
      <AddLead open={adding} onClose={() => { setAdding(false); if (params.get('add')) setParams(p => { p.delete('add'); return p; }, { replace: true }); }} onAdded={reload} />
    </>
  );
}

function AddLead({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const courses = useLoad(() => api.courses.list());
  const [f, setF] = useState({ name: '', phone: '', courseId: '', stage: 'INTERESTED' as Stage, followUpOn: addDays(todayIST(), 1), nextAction: '' });
  const [err, setErr] = useState('');
  const [dupId, setDupId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setErr(''); setDupId(null); };

  async function save() {
    if (f.name.trim().length < 2) return setErr("Enter the candidate's name.");
    if (f.phone.replace(/\D/g, '').length < 10) return setErr('Enter a 10-digit mobile number.');
    if (!f.courseId) return setErr('Choose a course or internship.');
    setBusy(true);
    try {
      const r = await api.leads.create({ ...f, courseId: Number(f.courseId), name: f.name.trim(), nextAction: f.nextAction.trim() || undefined, followUpOn: f.followUpOn || undefined });
      toast(`${r.lead.name} added to your leads`);
      setF({ name: '', phone: '', courseId: '', stage: 'INTERESTED', followUpOn: addDays(todayIST(), 1), nextAction: '' });
      onClose();
      onAdded();
    } catch (e) {
      setErr(errorText(e));
      if (e instanceof ApiError && e.status === 409) setDupId((e.details as { leadId?: number } | undefined)?.leadId ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add a lead" onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy}>Save lead</button></>}>
      <label className="field">Candidate name<input className="input" value={f.name} onChange={set('name')} autoComplete="off" autoFocus /></label>
      <label className="field">Mobile number<input className="input" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="98xxx xxxxx" /></label>
      <label className="field">Course or internship
        <select className="select" value={f.courseId} onChange={set('courseId')}>
          <option value="">Choose…</option>
          {courses.data?.courses.map(c => <option key={c.id} value={c.id}>{c.name} ({rupee(c.fee)})</option>)}
        </select>
      </label>
      <label className="field">Status
        <select className="select" value={f.stage} onChange={set('stage')}>{STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
      </label>
      <div className="form-grid">
        <label className="field">Follow-up date<input className="input" type="date" value={f.followUpOn} onChange={set('followUpOn')} /></label>
        <label className="field">Next action<input className="input" value={f.nextAction} onChange={set('nextAction')} placeholder="e.g. Send fee details" /></label>
      </div>
      {err && <span className="err" role="alert">{err} {dupId && <button type="button" className="linkbtn inline" onClick={() => nav(`/bde/leads/${dupId}`)}>Open it</button>}</span>}
    </Modal>
  );
}
