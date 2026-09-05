"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastAction = { label: string; onClick: () => void };

type ToastContextValue = {
  showToast: (message: string, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Global toast — call showToast() from anywhere, no local state or <Toast>
// render needed. Actions (e.g. "Undo") get a longer duration since they
// need time to be read and clicked, not just glanced at.
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ToastAction | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, toastAction?: ToastAction) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    setAction(toastAction ?? null);
    timeoutRef.current = setTimeout(
      () => {
        setMessage(null);
        setAction(null);
      },
      toastAction ? 5000 : 2500,
    );
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div
          role="status"
          className="toast-in fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-brass px-4 py-3 font-medium text-chalk shadow-lg"
        >
          <span>{message}</span>
          {action && (
            <button
              onClick={action.onClick}
              className="font-semibold underline underline-offset-2"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
