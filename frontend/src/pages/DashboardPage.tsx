import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDashboard } from '../hooks/useDashboard';
import { getErrorMessage, formatNumber } from '../lib/utils';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';

export default function DashboardPage() {
  const { data, isLoading, isError, error, isFetching } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Unable to load dashboard"
        description={getErrorMessage(error)}
      />
    );
  }

  const summary = data?.data;
  const distribution = summary?.shipmentStatusDistribution;
  const chartData = distribution
    ? Object.entries(distribution).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Dashboard</h2>
          <p className="text-sm text-slate-500">
            Live overview of customers and shipments
          </p>
        </div>
        {isFetching && <Spinner size="sm" />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-slate-500">Total Customers</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">
            {formatNumber(summary?.totalCustomers)}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-500">Total Shipments</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">
            {formatNumber(summary?.totalShipments)}
          </p>
        </Card>
      </div>

      <Card
        title="Shipment Status Distribution"
        description="Current breakdown of shipments by status"
      >
        {chartData.length === 0 ? (
          <EmptyState title="No shipment data available" />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
