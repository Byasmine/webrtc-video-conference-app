import { useEffect } from 'react';

type ToastProps = {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
};

export function Toast({ message, type = 'info', onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  const bgClass =
    type === 'success'
      ? 'bg-green-800/95 text-green-100'
      : type === 'error'
        ? 'bg-red-800/95 text-red-100'
        : 'bg-surface-800/95 text-primary border border-surface-border';

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-xl z-50 transition-opacity backdrop-blur text-sm ${bgClass}`}
      role="alert"
    >
      {message}
    </div>
  );
}
