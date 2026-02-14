import { useState, useCallback } from 'react';

type ToastState = {
  message: string;
  type: 'success' | 'error' | 'info';
} | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  const show = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToast({ message, type });
    },
    []
  );

  const hide = useCallback(() => setToast(null), []);

  return { toast, show, hide };
}
