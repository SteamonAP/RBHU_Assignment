import Badge from './Badge';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_TONES: Record<string, BadgeTone> = {
  // Customer statuses
  Active: 'success',
  Inactive: 'neutral',
  // Shipment statuses
  Pending: 'warning',
  PickedUp: 'info',
  InTransit: 'info',
  Delivered: 'success',
  Cancelled: 'danger',
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
