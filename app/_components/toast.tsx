"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useToast(durationMs = 2500) {
  const [message, setMessageState] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setMessageState(msg);
      timeoutRef.current = setTimeout(() => setMessageState(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { message, showToast };
}

export default function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="toast-in fixed bottom-6 right-6 z-50 rounded-sm bg-brass px-4 py-3 font-medium text-chalk shadow-lg"
    >
      {message}
    </div>
  );
}
