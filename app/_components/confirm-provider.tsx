"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmOptions & {
  message: string;
  resolve: (value: boolean) => void;
};

type ConfirmContextValue = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Promise-based replacement for window.confirm() — `await confirm("Delete
// this?")` resolves true/false once the floating dialog is answered.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve, ...options });
    });
  }, []);

  function handle(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-sm border border-rule bg-white p-5 shadow-xl">
            {state.title && (
              <p className="font-display text-lg font-semibold text-ink">{state.title}</p>
            )}
            <p className={`text-sm text-ink/80 ${state.title ? "mt-2" : ""}`}>
              {state.message}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => handle(false)}
                className="rounded-sm border border-rule px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => handle(true)}
                autoFocus
                className={`rounded-sm px-4 py-2 text-sm font-medium transition hover:brightness-110 ${
                  state.danger ? "bg-danger text-paper" : "bg-brass text-chalk"
                }`}
              >
                {state.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
