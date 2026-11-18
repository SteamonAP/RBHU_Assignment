import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from '../hooks/useCustomers';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { defaultMeta, formatDate, getErrorMessage } from '../lib/utils';
import type { Customer } from '../types';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import Select from '../components/ui/Select';
import Spinner from '../components/ui/Spinner';
import StatusBadge from '../components/ui/StatusBadge';

const customerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z
    .string()
    .min(1, 'Email is required')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email'),
  company: z.string().min(2, 'Company must be at least 2 characters').max(150),
  status: z.enum(['Active', 'Inactive']),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

const STATUS_OPTIONS = [
  { label: 'Active', value: 'Active' },
  { label: 'Inactive', value: 'Inactive' },
];

interface CustomerModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}

function CustomerModal({ customer, onClose, onSaved }: CustomerModalProps) {
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer
      ? {
          name: customer.name,
          email: customer.email,
          company: customer.company,
          status: customer.status,
        }
      : { name: '', email: '', company: '', status: 'Active' },
  });

  const onSubmit = async (values: CustomerFormValues) => {
    setSubmitError(null);
    try {
      if (customer) {
        await updateCustomer.mutateAsync({ id: customer.id, payload: values });
      } else {
        await createCustomer.mutateAsync(values);
      }
      onSaved();
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Unable to save customer'));
    }
  };

  return (
    <Modal
      open
      title={customer ? 'Edit customer' : 'New customer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" isLoading={isSubmitting}>
            {customer ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <form
        id="customer-form"
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <Input
          label="Name"
          placeholder="Acme Logistics"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Email"
          type="email"
          placeholder="contact@acme.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Company"
          placeholder="Acme Inc."
          error={errors.company?.message}
          {...register('company')}
        />
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

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error, refetch } = useCustomers({
    page,
    limit: 10,
    search: debouncedSearch,
    status,
  });
  const deleteCustomer = useDeleteCustomer();

  const customers = data?.data ?? [];
  const meta = data?.meta ?? defaultMeta(10);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setActionError(null);
    try {
      await deleteCustomer.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Unable to delete customer'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Customers</h2>
          <p className="text-sm text-slate-500">
            Manage your customer accounts
          </p>
        </div>
        <Button onClick={openCreate}>New customer</Button>
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
          <Input
            placeholder="Search by name, email or company"
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
            title="Unable to load customers"
            description={getErrorMessage(error)}
          />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers found"
            description="Try adjusting your search or create a new customer."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {customer.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {customer.email}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {customer.company}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={customer.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => openEdit(customer)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setDeleting(customer)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {customers.length > 0 && (
          <div className="px-4 pb-4">
            <Pagination meta={meta} onPageChange={setPage} />
          </div>
        )}
      </Card>

      {modalOpen && (
        <CustomerModal
          customer={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void refetch();
          }}
        />
      )}

      <Modal
        open={Boolean(deleting)}
        title="Delete customer"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={deleteCustomer.isPending}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete{' '}
          <span className="font-medium text-slate-800">{deleting?.name}</span>?
          This will soft-delete the customer.
        </p>
        {actionError && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}
      </Modal>
    </div>
  );
}
