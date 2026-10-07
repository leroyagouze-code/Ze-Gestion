"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";

export function SubmitButton({ children, className = "btn-primary w-full sm:w-auto", pendingText = "Enregistrement…", name, value }: { children: React.ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state?.error)
    return (
      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800" role="alert">
        ⚠️ {state.error}
      </div>
    );
  if (state?.ok)
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] text-emerald-800" role="status">
        ✅ {state.ok}
      </div>
    );
  return null;
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  showOk = true,
  confirm,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  showOk?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {(state?.error || (showOk && state?.ok)) && <FormMessage state={state} />}
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}
