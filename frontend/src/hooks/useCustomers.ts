import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerService } from '../services/customer.service';
import type { CustomerPayload, CustomerQuery } from '../services/customer.service';

const CUSTOMERS_KEY = 'customers';

export function useCustomers(params: CustomerQuery) {
  return useQuery({
    queryKey: [CUSTOMERS_KEY, params],
    queryFn: () => customerService.list(params),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerPayload) => customerService.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<CustomerPayload>;
    }) => customerService.update(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
