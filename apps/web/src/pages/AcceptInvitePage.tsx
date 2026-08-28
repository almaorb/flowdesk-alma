import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PublicInviteDto } from '@flowdesk/shared';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { InlineError } from '../components/States';
import { Spinner } from '../components/Spinner';
import { RoleBadge } from '../components/Badges';
import { AuthShell } from './AuthShell';

export default function AcceptInvitePage() {
  const { token = '' } = useParams();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.get<PublicInviteDto>(`/public/invites/${token}`, { anonymous: true }),
    retry: false,
  });

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const fieldErrors = error instanceof ApiError ? error.fieldMap : {};

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await acceptInvite({ token, name, password });
      navigate('/tickets', { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  }

  if (invite.isLoading) {
    return (
      <AuthShell title="Checking your invite…">
        <Spinner className="h-5 w-5 text-ink-400" />
      </AuthShell>
    );
  }

  if (invite.isError || !invite.data) {
    return (
      <AuthShell
        title="This invite is not valid"
        subtitle="It may have been used already, revoked, or expired."
        footer={
          <Link className="link font-medium" to="/login">
            Back to sign in
          </Link>
        }
      >
        <InlineError error={invite.error} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${invite.data.organizationName}`}
      subtitle="Choose a password to activate your account."
    >
      <div className="mb-5 flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
        <span className="font-mono text-[13px] text-ink-700">{invite.data.email}</span>
        <RoleBadge role={invite.data.role} />
      </div>

      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <TextField
          label="Your name"
          required
          value={name}
          error={fieldErrors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 10 characters."
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <InlineError error={error} />
        <Button type="submit" variant="primary" loading={submitting} className="w-full">
          Accept invite
        </Button>
      </form>
    </AuthShell>
  );
}
