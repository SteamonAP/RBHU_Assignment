import { useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { analyticsService } from '../services/analytics.service';
import { formatCurrency, formatNumber, getErrorMessage } from '../lib/utils';
import type { AnalyticsData } from '../types';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';

export default function AnalyticsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyticsData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file first.');
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const data = await analyticsService.analyze(file);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err, 'Analytics request failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const summary = result?.summary;

  const summaryRows: { label: string; value: string }[] = summary
    ? [
        { label: 'Total Revenue', value: formatCurrency(summary.totalRevenue) },
        {
          label: 'Average Revenue',
          value: formatCurrency(summary.averageRevenue),
        },
        { label: 'Highest Sale', value: formatCurrency(summary.highestSale) },
        { label: 'Lowest Sale', value: formatCurrency(summary.lowestSale) },
        { label: 'Total Records', value: formatNumber(summary.totalRecords) },
        {
          label: 'Unique Salespeople',
          value: formatNumber(summary.uniqueSalespeople),
        },
        {
          label: 'Unique Regions',
          value: formatNumber(summary.uniqueRegions),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Analytics</h2>
        <p className="text-sm text-slate-500">
          Upload a sales CSV to generate revenue insights
        </p>
      </div>

      <Card title="Upload dataset">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <Button onClick={handleUpload} isLoading={isUploading} disabled={!file}>
            Analyze
          </Button>
        </div>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </Card>

      {isUploading && (
        <Card>
          <p className="text-sm text-slate-500">Processing dataset…</p>
        </Card>
      )}

      {result && summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm font-medium text-slate-500">
                Total Revenue
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatCurrency(summary.totalRevenue)}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">
                Average Revenue
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatCurrency(summary.averageRevenue)}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">Highest Sale</p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatCurrency(summary.highestSale)}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">Lowest Sale</p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatCurrency(summary.lowestSale)}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">
                Total Records
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatNumber(summary.totalRecords)}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">
                Unique Salespeople
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatNumber(summary.uniqueSalespeople)}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">
                Unique Regions
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {formatNumber(summary.uniqueRegions)}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Revenue by Region">
              {result.revenueByRegion.length === 0 ? (
                <EmptyState title="No regional data" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={result.revenueByRegion}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="region" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) =>
                        formatCurrency(typeof value === 'number' ? value : undefined)
                      }
                    />
                    <Bar
                      dataKey="totalRevenue"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Top Salespeople">
              {result.topSalespeople.length === 0 ? (
                <EmptyState title="No salesperson data" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={result.topSalespeople}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="salesperson" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) =>
                        formatCurrency(typeof value === 'number' ? value : undefined)
                      }
                    />
                    <Bar
                      dataKey="totalRevenue"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          <Card title="Summary Statistics">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Metric</th>
                  <th className="px-2 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryRows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-2 py-2 text-slate-600">{row.label}</td>
                    <td className="px-2 py-2 text-right font-medium text-slate-800">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {!result && !isUploading && (
        <EmptyState
          title="No analytics yet"
          description="Upload a CSV file to see revenue summaries and charts."
        />
      )}
    </div>
  );
}
