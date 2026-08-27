import { randomBytes } from 'node:crypto';

export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'org';
}

export function slugCandidate(input: string, attempt: number): string {
  const base = slugify(input);
  if (attempt === 0) return base;
  return `${base}-${randomBytes(3).toString('hex')}`;
}
