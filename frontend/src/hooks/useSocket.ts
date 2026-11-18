import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';
import { TOKEN_KEY } from '../lib/api';
import type { ShipmentStatusChangedEvent } from '../types';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:5000';

export function useSocket() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const socket = io(SOCKET_URL, { auth: { token } });

    socket.on('shipment_status_changed', (payload: ShipmentStatusChangedEvent) => {
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notify(
        `${payload.trackingNumber}: ${payload.previousStatus} -> ${payload.status}`,
        'info',
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, notify]);
}
