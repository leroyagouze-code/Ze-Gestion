import { EmptyState, PageHeader, Pagination, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { listAudit } from "@/modules/users/service";

export const metadata = { title: "Journal d'activité" };

const LABELS: Record<string, string> = {
  "auth.login": "Connexion",
  "company.created": "Création de l'entreprise",
  "company.updated": "Modification des paramètres",
  "product.created": "Création de produit",
  "product.updated": "Modification de produit",
  "product.price_changed": "Changement de prix",
  "product.deleted": "Suppression de produit",
  "product.imported": "Import de produits",
  "stock.movement": "Mouvement de stock",
  "sale.created": "Vente",
  "sale.cancelled": "Annulation de vente",
  "invoice.created": "Création de facture",
  "invoice.cancelled": "Annulation de facture",
  "invoice.payment": "Paiement de facture",
  "quote.created": "Création de proforma",
  "quote.updated": "Modification de proforma",
  "quote.sent": "Proforma envoyée",
  "quote.accepted": "Proforma acceptée",
  "quote.refused": "Proforma refusée",
  "quote.reopened": "Proforma rouverte",
  "quote.converted": "Proforma convertie en facture",
  "customer.created": "Création de client",
  "customer.updated": "Modification de client",
  "customer.payment": "Encaissement de créance",
  "supplier.created": "Création de fournisseur",
  "supplier.updated": "Modification de fournisseur",
  "expense.created": "Dépense",
  "expense.deleted": "Suppression de dépense",
  "user.added": "Ajout d'utilisateur",
  "user.updated": "Modification d'utilisateur",
  "role.created": "Création de rôle",
  "role.updated": "Modification de rôle",
  "platform.company_suspended": "Suspension par la plateforme",
  "platform.company_active": "Réactivation par la plateforme",
  "platform.plan_changed": "Changement de formule",
};

function describe(meta: Record<string, unknown> | null) {
  if (!meta) return "";
  const parts: string[] = [];
  for (const k of ["number", "name", "email", "reason", "kind", "category"]) if (meta[k]) parts.push(String(meta[k]));
  if (Array.isArray(meta.salePrice)) parts.push(`prix : ${meta.salePrice[0]} → ${meta.salePrice[1]}`);
  if (typeof meta.delta === "number") parts.push(`${meta.delta > 0 ? "+" : ""}${meta.delta}`);
  if (typeof meta.total === "number") parts.push(`total ${meta.total}`);
  return parts.join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireContext("audit.view");
  const sp = await searchParams;
  const data = await listAudit(ctx, { page: Number(sp.page) });
  return (
    <>
      <PageHeader title="Journal d'activité" />
      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState title="Aucune activité" />
        ) : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th className="hidden md:table-cell">Élément</th><th className="hidden lg:table-cell">IP</th></tr></thead>
              <tbody>
                {data.rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{formatDate(a.createdAt, true)}</td>
                    <td>{a.userName ?? "—"}</td>
                    <td>{LABELS[a.action] ?? a.action}</td>
                    <td className="hidden text-slate-500 md:table-cell">{describe(a.metadata)}</td>
                    <td className="hidden text-slate-400 lg:table-cell">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
      <Pagination page={data.page} total={data.total} pageSize={data.pageSize} />
    </>
  );
}
