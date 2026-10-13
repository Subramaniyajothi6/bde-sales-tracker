import { api } from '../../api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { fmtClock, int, monthName, short } from '../../lib/format';
import { ErrorNote, Loading, StatStrip } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { CallBars } from '../../components/CallBars';
import { InstallCard } from '../../lib/pwa';
import { LeaveSection } from './LeaveSection';

export default function Month() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad(() => api.stats.bde(user!.id));
  const att = useLoad(() => api.attendance.mine());

  if (error) return <main className="wrap"><ErrorNote error={error} onRetry={reload} /></main>;
  if (!data) return <main className="wrap"><Loading /></main>;
  const s = data.stats;

  return (
    <>
      <PageHead title={`My ${monthName(data.month)}`} sub={data.rank ? `You are #${data.rank} of ${data.teamSize} BDEs this month (by revenue).` : undefined}>
        <StatStrip items={[
          { name: 'Calls', value: int(s?.calls ?? 0), sub: `${s?.daysOnTarget ?? 0} of ${s?.daysWorked ?? 0} days on target` },
          { name: 'Interviews attended', value: s?.attended ?? 0 },
          { name: 'Payments', value: s?.paid ?? 0, sub: 'verified' },
          { name: 'Revenue', value: short(s?.revenue ?? 0) }
        ]} />
      </PageHead>
      <main className="wrap">
        <InstallCard />
        <div className="row">
          <section className="panel panel-pad grow">
            <div className="sec-head" style={{ marginBottom: 12 }}><h2 className="h2">Calls each day</h2><span className="small muted">Target {data.bde.dailyTarget} a day</span></div>
            <CallBars days={data.days} target={data.bde.dailyTarget} />
          </section>
          <section className="panel side">
            <div className="panel-head"><h2>Attendance</h2>{att.data && <span className="small muted">Late after {fmtClock(att.data.lateAfter)}</span>}</div>
            {att.data ? (
              <div className="panel-pad">
                <div className="stats four">
                  {([[att.data.totals.present, 'present'], [att.data.totals.late, 'late'], [att.data.totals.leave, 'leave'], [att.data.totals.absent, 'absent']] as const)
                    .map(([v, l]) => <div className="stat" key={l}><span className="digits">{v}</span><small>{l}</small></div>)}
                </div>
                {att.data.totals.hours > 0 && <p className="small muted" style={{ marginTop: 12 }}>{att.data.totals.hours} hours worked this month (start of day to report sent).</p>}
              </div>
            ) : <Loading />}
          </section>
        </div>
        <LeaveSection />
      </main>
    </>
  );
}
