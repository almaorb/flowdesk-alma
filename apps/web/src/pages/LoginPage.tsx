import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { InlineError } from '../components/States';
import { AuthShell } from './AuthShell';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/tickets';

  const [email, setEmail] = useState('ada.lovelace@northwind.test');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const fieldErrors = error instanceof ApiError ? error.fieldMap : {};

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Enter your credentials to reach your queue."
      footer={
        <>
          Need a workspace?{' '}
          <Link className="link font-medium" to="/signup">
            Create an organization
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <InlineError error={error} />
        <Button type="submit" variant="primary" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
