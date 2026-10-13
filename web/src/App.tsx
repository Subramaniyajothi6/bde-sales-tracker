import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from './api';
import { useAuth } from './lib/auth';
import { AdminShell, BdeShell } from './components/Shells';
import Login, { homeFor } from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/admin/Dashboard';
import DailyReports from './pages/admin/DailyReports';
import AdminLeads from './pages/admin/Leads';
import AdminInterviews from './pages/admin/Interviews';
import AdminPayments from './pages/admin/Payments';
import Reports from './pages/admin/Reports';
import Team from './pages/admin/Team';
import BdeDetail from './pages/admin/BdeDetail';
import Today from './pages/bde/Today';
import BdeLeads from './pages/bde/Leads';
import LeadDetail from './pages/bde/LeadDetail';
import BdeInterviews from './pages/bde/Interviews';
import BdePayments from './pages/bde/Payments';
import RecordPayment from './pages/bde/RecordPayment';
import Month from './pages/bde/Month';
import Profile from './pages/bde/Profile';
import Attendance from './pages/admin/Attendance';
import Activity from './pages/admin/Activity';
import ChatPage from './pages/Chat';

/** Only for the given role. Sends everyone else to login or their own home. */
function Only({ role, children }: { role: Role; children: ReactNode }) {
  const { user, checking } = useAuth();
  const loc = useLocation();
  if (checking) return <div className="empty" aria-busy="true">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, checking } = useAuth();
  if (checking) return null;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

function LoginRoute() {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : homeFor(user.role)} replace />;
  return <Login />;
}

function ChangePasswordRoute() {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <ChangePassword />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/change-password" element={<ChangePasswordRoute />} />

      <Route path="/admin" element={<Only role="ADMIN"><AdminShell /></Only>}>
        <Route index element={<Dashboard />} />
        <Route path="daily-reports" element={<DailyReports />} />
        <Route path="leads" element={<AdminLeads />} />
        <Route path="interviews" element={<AdminInterviews />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="team" element={<Team />} />
        <Route path="bde/:id" element={<BdeDetail />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="activity" element={<Activity />} />
        <Route path="chat" element={<ChatPage role="admin" />} />
        <Route path="chat/:id" element={<ChatPage role="admin" />} />
      </Route>

      <Route path="/bde" element={<Only role="BDE"><BdeShell /></Only>}>
        <Route index element={<Today />} />
        <Route path="leads" element={<BdeLeads />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="interviews" element={<BdeInterviews />} />
        <Route path="payments" element={<BdePayments />} />
        <Route path="payments/new" element={<RecordPayment />} />
        <Route path="me" element={<Month />} />
        <Route path="me/profile" element={<Profile />} />
        <Route path="chat" element={<ChatPage role="bde" />} />
        <Route path="chat/:id" element={<ChatPage role="bde" />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
