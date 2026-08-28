import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { InlineError } from '../components/States';
import { AuthShell } from './AuthShell';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const fieldErrors = error instanceof ApiError ? error.fieldMap : {};
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signup(form);
      navigate('/tickets', { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Signing up creates a new organization with you as its first admin."
      footer={
        <>
          Already have an account?{' '}
          <Link className="link font-medium" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <TextField
          label="Organization name"
          required
          placeholder="Acme Support"
          value={form.organizationName}
          error={fieldErrors.organizationName}
          onChange={set('organizationName')}
        />
        <TextField
          label="Your name"
          required
          placeholder="Jane Doe"
          value={form.name}
          error={fieldErrors.name}
          onChange={set('name')}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="username"
          required
          value={form.email}
          error={fieldErrors.email}
          onChange={set('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters."
          value={form.password}
          error={fieldErrors.password}
          onChange={set('password')}
        />
        <InlineError error={error} />
        <Button type="submit" variant="primary" loading={submitting} className="w-full">
          Create organization
        </Button>
      </form>
    </AuthShell>
  );
}
