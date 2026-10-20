"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Relit la page toutes les 4 secondes tant que le paiement attend la confirmation du téléphone. */
export function RefreshWhilePending() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
