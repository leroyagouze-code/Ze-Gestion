import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/auth/server";
import { setRequestTimeZone } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { csvResponse, toCsv } from "@/lib/csv";
import { localDate } from "@/lib/dates";
import { errorMessage } from "@/lib/actions";
import { CSV_COLUMNS, exportProducts } from "@/modules/products/service";
import { listCustomers } from "@/modules/customers/service";
import { salesReport, stockReport } from "@/modules/reports/service";
import { periodRange, type PeriodKey } from "@/modules/dashboard/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const ctx = await getContext();
  if (ctx) setRequestTimeZone(ctx.company.timezone);
  if (!ctx) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { entity } = await params;
  if (entity !== "products-template" && !can(ctx.permissions, "data.export")) {
    return NextResponse.json({ error: "Vous n'êtes pas autorisé à exporter les données" }, { status: 403 });
  }
  const today = localDate(new Date());
  try {
    switch (entity) {
      case "products-template":
        return csvResponse(toCsv([], [...CSV_COLUMNS]), "modele-produits.csv");
      case "products":
        return csvResponse(toCsv(await exportProducts(ctx)), `produits-${today}.csv`);
      case "stock":
        return csvResponse(
          toCsv((await stockReport(ctx)).map((r) => ({ produit: r.name, sku: r.sku ?? "", quantite: r.quantity, prix_achat: r.purchasePrice ?? "", prix_vente: r.salePrice, valeur_achat: r.purchasePrice != null ? r.quantity * r.purchasePrice : "" }))),
          `stock-${today}.csv`,
        );
      case "customers": {
        const all = await listCustomers(ctx, { page: 1 });
        const rows = [];
        for (let p = 1; p <= Math.ceil(all.total / all.pageSize); p++) rows.push(...(p === 1 ? all.rows : (await listCustomers(ctx, { page: p })).rows));
        return csvResponse(
          toCsv(rows.map((c) => ({ nom: c.name, entreprise: c.companyName ?? "", telephone: c.phone ?? "", whatsapp: c.whatsapp ?? "", email: c.email ?? "", adresse: c.address ?? "", total_depense: c.totalSpent, solde_du: c.balanceDue }))),
          `clients-${today}.csv`,
        );
      }
      case "sales": {
        const sp = req.nextUrl.searchParams;
        const range = periodRange((sp.get("period") ?? "month") as PeriodKey, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
        const r = await salesReport(ctx, range);
        return csvResponse(
          toCsv(r.byDay.map((d) => ({ date: d.date, ventes: d.count, total_ht: d.subtotal, tva: d.tax, total_ttc: d.total, ...(r.showProfit ? { cout: d.cost, marge: d.total - d.tax - d.cost } : {}), credit: d.due }))),
          `ventes-${today}.csv`,
        );
      }
      default:
        return NextResponse.json({ error: "Export inconnu" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 403 });
  }
}
