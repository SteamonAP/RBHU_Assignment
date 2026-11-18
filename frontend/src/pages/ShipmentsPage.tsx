import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateShipment,
  useShipments,
  useUpdateShipmentStatus,
} from '../hooks/useShipments';
import { useCustomers } from '../hooks/useCustomers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { defaultMeta, formatDate, getErrorMessage } from '../lib/utils';
import type { Shipment, ShipmentStatus } from '../types';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import Select from '../components/ui/Select';
import Spinner from '../components/ui/Spinner';
import StatusBadge from '../components/ui/StatusBadge';

const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'Pending',
  'PickedUp',
  'InTransit',
  'Delivered',
  'Cancelled',
];

const STATUS_OPTIONS = SHIPMENT_STATUSES.map((status) => ({
  label: status,
  value: status,
}));

const shipmentSchema = z.object({
  trackingNumber: z
    .string()
    .min(3, 'Tracking number must be at least 3 characters')
    .max(50),
  customerId: z.string().min(1, 'Customer is required'),
  origin: z.string().min(2, 'Origin must be at least 2 characters').max(100),
  destination: z
    .string()
    .min(2, 'Destination must be at least 2 characters')
    .max(100),
  status: z.enum(['Pending', 'PickedUp', 'InTransit', 'Delivered', 'Cancelled']),
});

type ShipmentFormValues = z.infer<typeof shipmentSchema>;

interface ShipmentModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function ShipmentModal({ onClose, onSaved }: ShipmentModalProps) {
  const createShipment = useCreateShipment();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { data: customersData } = useCustomers({ page: 1, limit: 100 });

  const customerOptions = useMemo(
    () =>
      (customersData?.data ?? []).map((customer) => ({
        label: `${customer.name}${customer.company ? ` (${customer.company})` : ''}`,
        value: customer.id,
      })),
    [customersData],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: {
      trackingNumber: '',
      customerId: '',
      origin: '',
      destination: '',
      status: 'Pending',
    },
  });

  const onSubmit = async (values: ShipmentFormValues) => {
    setSubmitError(null);
    try {
      await createShipment.mutateAsync(values);
      onSaved();
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Unable to create shipment'));
    }
  };

  return (
    <Modal
      open
      title="New shipment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="shipment-form" isLoading={isSubmitting}>
            Create shipment
          </Button>
        </>
      }
    >
      <form
        id="shipment-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <Input
          label="Tracking number"
          placeholder="TRK-2026-001"
          error={errors.trackingNumber?.message}
          {...register('trackingNumber')}
        />
        <Select
          label="Customer"
          options={customerOptions}
          placeholder="Select a customer"
          error={errors.customerId?.message}
          {...register('customerId')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Origin"
            placeholder="Shanghai"
            error={errors.origin?.message}
            {...register('origin')}
          />
          <Input
            label="Destination"
            placeholder="Singapore"
            error={errors.destination?.message}
            {...register('destination')}
          />
        </div>
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register('status')}
        />
        {submitError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}
      </form>
    </Modal>
  );
}

interface StatusModalProps {
  shipment: Shipment;
  onClose: () => void;
  onSaved: () => void;
}

function StatusModal({ shipment, onClose, onSaved }: StatusModalProps) {
  const updateStatus = useUpdateShipmentStatus();
  const [status, setStatus] = useState<ShipmentStatus>(shipment.status);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSave = async () => {
    setSubmitError(null);
    try {
      await updateStatus.mutateAsync({ id: shipment.id, status });
      onSaved();
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Unable to update status'));
    }
  };

  return (
    <Modal
      open
      title="Update shipment status"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={updateStatus.isPending} onClick={handleSave}>
            Save status
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Tracking number:{' '}
        <span className="font-medium text-slate-800">
          {shipment.trackingNumber}
        </span>
      </p>
      <Select
        label="Status"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(event) => setStatus(event.target.value as ShipmentStatus)}
      />
      {submitError && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}
    </Modal>
  );
}

export default function ShipmentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [statusShipment, setStatusShipment] = useState<Shipment | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch } = useShipments({
    page,
    limit: 10,
    search: debouncedSearch,
    status,
  });

  const shipments = data?.data ?? [];
  const meta = data?.meta ?? defaultMeta(10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Shipments</h2>
          <p className="text-sm text-slate-500">
            Track and update shipment statuses
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New shipment</Button>
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
          <Input
            placeholder="Search by tracking number"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="sm:max-w-sm"
          />
          <Select
            options={STATUS_OPTIONS}
            placeholder="All statuses"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="sm:max-w-[180px]"
          />
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <EmptyState
            title="Unable to load shipments"
            description={getErrorMessage(error)}
          />
        ) : shipments.length === 0 ? (
          <EmptyState
            title="No shipments found"
            description="Try adjusting your filters or create a new shipment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tracking #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {shipment.trackingNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {shipment.customer?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {shipment.origin} → {shipment.destination}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={shipment.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(shipment.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="secondary"
                          onClick={() => setStatusShipment(shipment)}
                        >
                          Update status
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {shipments.length > 0 && (
          <div className="px-4 pb-4">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {createOpen && (
        <ShipmentModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            void refetch();
          }}
        />
      )}

      {statusShipment && (
        <StatusModal
          shipment={statusShipment}
          onClose={() => setStatusShipment(null)}
          onSaved={() => {
            setStatusShipment(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
