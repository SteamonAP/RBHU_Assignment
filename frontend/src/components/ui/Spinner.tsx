import { cn } from '../../lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-4',
};

export default function Spinner({
  size = 'md',
  className,
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-slate-300 border-t-blue-600',
        SIZES[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
