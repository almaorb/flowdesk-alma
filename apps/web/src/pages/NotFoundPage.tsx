import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="font-mono text-sm text-ink-400">404</p>
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-500">
        The page you were looking for does not exist, or you do not have access to it.
      </p>
      <Link className="link mt-2 text-sm font-medium" to="/tickets">
        Back to tickets
      </Link>
    </div>
  );
}
