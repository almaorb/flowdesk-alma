import { useState, type FormEvent } from 'react';
import { ROLES } from '@flowdesk/shared';
import type { Role } from '@flowdesk/shared';
import {
  useCreateInvite,
  useInvites,
  useRevokeInvite,
  useUpdateUser,
  useUsers,
} from '../hooks/queries';
import { formatDate, formatRelative } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Avatar } from '../components/Avatar';
import { RoleBadge } from '../components/Badges';
import { Button } from '../components/Button';
import { SelectField, TextField } from '../components/Field';
import { Modal } from '../components/Modal';
import { EmptyState, InlineError } from '../components/States';
import { SkeletonRows } from '../components/Spinner';

export default function TeamPage() {
  const users = useUsers();
  const invites = useInvites();
  const updateUser = useUpdateUser();
  const revoke = useRevokeInvite();

  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this invite link:', url);
      return;
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Team"
        description="Members of your organization and any outstanding invitations."
        actions={
          <Button variant="primary" onClick={() => setInviting(true)}>
            Invite member
          </Button>
        }
      />

      <section className="card mb-6 overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">Members</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Name</th>
              <th className="table-head w-44">Role</th>
              <th className="table-head w-32">Status</th>
              <th className="table-head w-40">Joined</th>
              <th className="table-head w-32" />
            </tr>
          </thead>
          <tbody>
            {users.isLoading ? (
              <SkeletonRows cols={5} rows={4} />
            ) : (
              users.data?.data.map((member) => (
                <tr key={member.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2.5">
                      <Avatar name={member.name} id={member.id} size="sm" />
                      <span>
                        <span className="block text-sm font-medium text-ink-900">
                          {member.name}
                        </span>
                        <span className="block text-xs text-ink-500">{member.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className="field h-8 py-1 text-xs"
                      value={member.role}
                      onChange={(event) =>
                        updateUser.mutate({ id: member.id, role: event.target.value })
                      }
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                        member.isActive
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                          : 'bg-ink-100 text-ink-500 ring-ink-500/20'
                      }`}
                    >
                      {member.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-500">
                    {formatDate(member.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateUser.mutate({ id: member.id, isActive: !member.isActive })
                      }
                    >
                      {member.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <InlineError error={updateUser.error} />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">Pending invites</h2>
          <p className="text-xs text-ink-500">
            Invite links are single-use and expire after seven days.
          </p>
        </div>
        {(invites.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No pending invites"
            description="Invite a teammate to give them access to this organization."
            action={
              <Button variant="primary" onClick={() => setInviting(true)}>
                Invite member
              </Button>
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-head">Email</th>
                <th className="table-head w-28">Role</th>
                <th className="table-head w-36">Expires</th>
                <th className="table-head w-56 text-right">Link</th>
              </tr>
            </thead>
            <tbody>
              {invites.data?.map((invite) => (
                <tr key={invite.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[13px] text-ink-700">{invite.email}</td>
                  <td className="px-4 py-2.5">
                    <RoleBadge role={invite.role} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-500">
                    {formatRelative(invite.expiresAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => void copy(invite.url, invite.id)}>
                        {copied === invite.id ? 'Copied' : 'Copy link'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => revoke.mutate(invite.id)}>
                        Revoke
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <InviteModal open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createInvite = useCreateInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('AGENT');
  const [created, setCreated] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const invite = await createInvite.mutateAsync({ email, role });
    setCreated(invite.url);
    setEmail('');
  }

  function close() {
    setCreated(null);
    createInvite.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      title="Invite a team member"
      description="FlowDesk does not send email in this build — copy the link and share it."
      onClose={close}
    >
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Invite created. Share this link:</p>
          <code className="block break-all rounded-lg border border-ink-200 bg-ink-50 p-3 font-mono text-xs text-ink-800">
            {created}
          </code>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreated(null)}>Invite another</Button>
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <TextField
            label="Email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <SelectField
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
          <InlineError error={createInvite.error} />
          <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" loading={createInvite.isPending}>
              Create invite link
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
