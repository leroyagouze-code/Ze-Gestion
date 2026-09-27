"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge la page dès que la commande n'est plus en attente (paiement confirmé ou refusé). */
export function OrderPoller({ reference }: { reference: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const res = await fetch(`/api/licences/commandes/${reference}`, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? ((await res.json()) as { status: string }) : null;
      if (body && body.status !== "pending") return router.refresh();
      setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [reference, router]);
  return null;
}
