import { requireContext } from "@/lib/auth/server";
import { currencyDecimals, isTaxMode } from "@/lib/money";
import { can } from "@/lib/permissions";
import { posBootstrap } from "@/modules/sales/service";
import { Pos } from "./pos";

export const metadata = { title: "Caisse" };

export default async function PosPage() {
  const ctx = await requireContext("sales.create");
  const data = await posBootstrap(ctx);
  const canCredit = can(ctx.permissions, "sales.credit");
  return (
    <Pos
      currency={ctx.company.currency}
      decimals={currencyDecimals(ctx.company.currency)}
      taxMode={isTaxMode(ctx.company.taxMode) ? ctx.company.taxMode : "line"}
      paymentMethods={canCredit ? data.paymentMethods : data.paymentMethods.filter((pm) => pm.type !== "credit")}
      canCreateCustomer={can(ctx.permissions, "customers.create")}
      canDiscount={can(ctx.permissions, "sales.discount")}
      canInvoice={can(ctx.permissions, "invoices.create")}
    />
  );
}
