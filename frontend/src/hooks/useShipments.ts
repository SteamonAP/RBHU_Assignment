import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shipmentService } from '../services/shipment.service';
import type { ShipmentPayload, ShipmentQuery } from '../services/shipment.service';
import type { ShipmentStatus } from '../types';

const SHIPMENTS_KEY = 'shipments';

export function useShipments(params: ShipmentQuery) {
  return useQuery({
    queryKey: [SHIPMENTS_KEY, params],
    queryFn: () => shipmentService.list(params),
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ShipmentPayload) => shipmentService.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SHIPMENTS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ShipmentStatus }) =>
      shipmentService.updateStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SHIPMENTS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
