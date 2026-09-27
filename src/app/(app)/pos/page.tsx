import { requireContext } from "@/lib/auth/server";
import { currencyDecimals } from "@/lib/money";
import { posBootstrap } from "@/modules/sales/service";
import { Pos } from "./pos";

export const metadata = { title: "Caisse" };

export default async function PosPage() {
  const ctx = await requireContext("sales.create");
  const data = await posBootstrap(ctx);
  return <Pos currency={ctx.company.currency} decimals={currencyDecimals(ctx.company.currency)} paymentMethods={data.paymentMethods} customers={data.customers} />;
}
