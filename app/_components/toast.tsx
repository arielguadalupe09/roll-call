"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ToastAction = { label: string; onClick: () => void };

export function useToast(durationMs = 2500) {
  const [message, setMessageState] = useState<string | null>(null);
  const [action, setActionState] = useState<ToastAction | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, toastAction?: ToastAction) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setMessageState(msg);
      setActionState(toastAction ?? null);
      timeoutRef.current = setTimeout(() => {
        setMessageState(null);
        setActionState(null);
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { message, action, showToast };
}

export default function Toast({
  message,
  action,
}: {
  message: string | null;
  action?: ToastAction | null;
}) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="toast-in fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-sm bg-brass px-4 py-3 font-medium text-chalk shadow-lg"
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
  );
}
