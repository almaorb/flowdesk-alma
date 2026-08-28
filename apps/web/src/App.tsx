import { Navigate, Route, Routes } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from './auth/guards';
import { Layout } from './components/Layout';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import TicketsPage from './pages/TicketsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditPage from './pages/AuditPage';
import TeamPage from './pages/TeamPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthenticated>
            <SignupPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />

          {/* Mirrors the API's requireRole('ADMIN') guards. */}
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/team" element={<TeamPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
