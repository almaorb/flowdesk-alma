import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRIORITIES } from '@flowdesk/shared';
import type { Priority } from '@flowdesk/shared';
import { useAuth } from '../auth/AuthContext';
import { useCreateTicket, useTags, useUsers } from '../hooks/queries';
import { ApiError } from '../lib/api';
import { Button } from '../components/Button';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { InlineError } from '../components/States';
import { Modal } from '../components/Modal';
import { PRIORITY_LABELS, TagChip } from '../components/Badges';

export function NewTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const createTicket = useCreateTicket();
  const users = useUsers();
  const tags = useTags();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  const isStaff = hasRole('ADMIN', 'AGENT');
  const people = users.data?.data ?? [];
  const fieldErrors = createTicket.error instanceof ApiError ? createTicket.error.fieldMap : {};

  function reset() {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setAssigneeId('');
    setCustomerId('');
    setTagIds([]);
    createTicket.reset();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const ticket = await createTicket.mutateAsync({
      title,
      description,
      priority,
      ...(assigneeId ? { assigneeId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
    });
    reset();
    onClose();
    navigate(`/tickets/${ticket.id}`);
  }

  return (
    <Modal
      open={open}
      title="New ticket"
      description="Filed against your organization; the SLA clock starts immediately."
      width="max-w-2xl"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <TextField
          label="Subject"
          required
          autoFocus
          placeholder="Short summary of the problem"
          value={title}
          error={fieldErrors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextAreaField
          label="Description"
          required
          rows={5}
          placeholder="What happened, what was expected, and anything that helps reproduce it."
          value={description}
          error={fieldErrors.description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </SelectField>

          {isStaff ? (
            <>
              <SelectField
                label="Customer"
                value={customerId}
                error={fieldErrors.customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Me</option>
                {people
                  .filter((person) => person.role === 'CUSTOMER')
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
              </SelectField>

              <SelectField
                label="Assignee"
                value={assigneeId}
                error={fieldErrors.assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {people
                  .filter((person) => person.role !== 'CUSTOMER')
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
              </SelectField>
            </>
          ) : null}
        </div>

        {isStaff && (tags.data?.length ?? 0) > 0 ? (
          <div>
            <span className="field-label">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {(tags.data ?? []).map((tag) => {
                const selected = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setTagIds((previous) =>
                        selected ? previous.filter((id) => id !== tag.id) : [...previous, tag.id],
                      )
                    }
                    className={selected ? 'opacity-100' : 'opacity-45 transition hover:opacity-80'}
                  >
                    <TagChip tag={tag} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <InlineError error={createTicket.error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={createTicket.isPending}>
            Create ticket
          </Button>
        </div>
      </form>
    </Modal>
  );
}
