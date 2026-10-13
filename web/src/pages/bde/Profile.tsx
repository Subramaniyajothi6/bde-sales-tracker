import { useAuth } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { PageHead } from '../../components/PageHead';
import { PasswordForm } from '../ChangePassword';

export default function Profile() {
  const { user } = useAuth();
  if (!user) return null;
  const facts: [string, string][] = [
    ['Employee ID', user.employeeId], ['Mobile', user.phone], ['Email', user.email ?? '–'],
    ['Joined', `${fmtDate(user.joinedOn)} ${user.joinedOn.slice(0, 4)}`], ['Daily target', `${user.dailyTarget} calls`]
  ];
  return (
    <>
      <PageHead title={user.name} sub="Your details and password." />
      <main className="wrap">
        <div className="row">
          <section className="panel grow">
            <div className="panel-head"><h2>My details</h2></div>
            <div className="panel-pad form-col">
              <dl className="facts">{facts.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              <p className="small muted">To change your name, phone or email, ask your admin.</p>
            </div>
          </section>
          <section className="panel side">
            <div className="panel-head"><h2>Change password</h2></div>
            <div className="panel-pad"><PasswordForm /></div>
          </section>
        </div>
      </main>
    </>
  );
}
