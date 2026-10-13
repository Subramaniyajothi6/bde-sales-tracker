import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { int, monthName, short } from '../../lib/format';
import { ErrorNote, Loading } from '../../components/ui';
import { CallBars } from '../../components/CallBars';

export default function Month() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad(() => api.stats.bde(user!.id));

  return (
    <>
      <section className="bde-head">
        <div className="top"><span><b>{user?.name}, {user?.employeeId}</b></span><Link to="/bde/me/profile">Profile</Link></div>
        <h1>My {data ? monthName(data.month).split(' ')[0] : 'month'}</h1>
        {data?.rank && <div className="rankline"><span className="digits">#{data.rank}</span><span>of {data.teamSize} BDEs this month</span></div>}
      </section>
      <main className="bde-main">
        {error ? <ErrorNote error={error} onRetry={reload} /> : !data ? <Loading /> : (
          <>
            <div className="stats">
              {([[int(data.stats?.calls ?? 0), 'calls'], [data.stats?.attended ?? 0, 'interviews attended'], [data.stats?.paid ?? 0, 'payments'], [short(data.stats?.revenue ?? 0), 'revenue']] as const)
                .map(([v, l]) => <div className="stat" key={l}><span className="digits">{v}</span><small>{l}</small></div>)}
            </div>
            <section className="sec">
              <div className="sec-head"><h2>Calls each day</h2><span className="small muted">Target {data.bde.dailyTarget}</span></div>
              <div className="panel panel-pad"><CallBars days={data.days} target={data.bde.dailyTarget} /></div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
