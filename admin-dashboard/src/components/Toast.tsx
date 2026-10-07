import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const COLORS: Record<ToastType, string> = {
  success: 'border-teal bg-teal-mist text-teal',
  error: 'border-crimson bg-crimson-mist text-crimson',
  warning: 'border-amber bg-amber-mist text-amber',
  info: 'border-navy bg-navy-mist text-navy',
};

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.2s, transform 0.2s';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    const timer = setTimeout(() => onDismiss(t.id), 3500);
    return () => clearTimeout(timer);
  }, [t.id, onDismiss]);

  return (
    <div ref={ref} className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg cursor-pointer max-w-sm ${COLORS[t.type]}`} onClick={() => onDismiss(t.id)}>
      <span className="font-bold text-sm">{ICONS[t.type]}</span>
      <span className="text-sm font-medium">{t.message}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50">
        {toasts.map((t) => <ToastItem key={t.id} t={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
