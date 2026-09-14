"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Button from "./button";

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
          <div className="w-full max-w-sm rounded-[10px] border border-line bg-card p-5 shadow-lg">
            {state.title && (
              <p className="font-display text-lg font-semibold text-ink">{state.title}</p>
            )}
            <p className={`text-sm text-ink/80 ${state.title ? "mt-2" : ""}`}>
              {state.message}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => handle(false)}>
                {state.cancelLabel ?? "Cancel"}
              </Button>
              <Button variant={state.danger ? "danger" : "primary"} onClick={() => handle(true)} autoFocus>
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
