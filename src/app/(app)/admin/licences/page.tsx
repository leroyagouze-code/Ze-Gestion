import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { getSession } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { LICENSE_PLANS } from "@/lib/license";
import { formatMoney } from "@/lib/money";
import { canIssueLicenses, LICENSE_DURATIONS, listLicenseIssues } from "@/modules/billing/license";
import { listOrders, listPrices, ORDER_STATUS } from "@/modules/billing/license-orders";
import { NETWORKS, paymentMode } from "@/modules/billing/paygate";
import { issueLicenseAction, savePriceAction } from "../actions";
import { LicenseGenerator } from "./generator";

export const metadata = { title: "Licences du logiciel" };

export const dynamic = "force-dynamic";

const MODE_TEXT = {
  paygate: { tone: "green", label: "PayGate Global", text: "Les clients paient par TMoney ou Flooz ; la licence est créée dès que PayGate confirme le paiement." },
  simulation: { tone: "amber", label: "Mode test", text: "Aucun argent n'est encaissé : sur la page de paiement, on choisit si le paiement réussit ou échoue." },
} as const;

export default async function LicencesPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const s = await getSession();
  if (!s?.isSuperAdmin) redirect("/forbidden");
  const { statut } = await searchParams;
  const [rows, orders, prices] = await Promise.all([listLicenseIssues(), listOrders(s, { status: statut }), listPrices()]);
  const mode = paymentMode();
  const shopUrl = `${process.env.APP_URL ?? ""}/acheter-licence`;
  return (
    <>
      <PageHeader
        title="Licences du logiciel Windows"
        subtitle="Ventes en ligne, tarifs, et codes créés à la main pour les clients qui paient autrement."
        actions={<Link href="/admin" className="btn-secondary">Retour</Link>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Vente en ligne" className="xl:col-span-2">
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            {mode ? (
              <p>
                <Badge tone={MODE_TEXT[mode].tone}>{MODE_TEXT[mode].label}</Badge> {MODE_TEXT[mode].text}
              </p>
            ) : (
              <p className="text-amber-800">Fermée : ajoutez PAYGATE_API_KEY (ou PAYMENT_MODE=simulation pour tester) dans le fichier .env puis redémarrez.</p>
            )}
            <a href="/acheter-licence" target="_blank" className="btn-secondary whitespace-nowrap">Ouvrir la page d&apos;achat</a>
          </div>
          <p className="mt-2 text-xs text-slate-500">Adresse de la page d&apos;achat : <span className="font-mono">{shopUrl}</span>. Le logiciel y envoie le client avec son code d&apos;installation déjà rempli.</p>
        </Card>
        <Card title="Achats de licence" className="xl:col-span-2" actions={
          <div className="flex flex-wrap gap-1 text-xs">
            {[["", "Tous"], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
              <Link key={k} href={k ? `/admin/licences?statut=${k}` : "/admin/licences"} className={`rounded-full border px-2 py-0.5 ${(statut ?? "") === k ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600"}`}>{l}</Link>
            ))}
          </div>
        }>
          {orders.length === 0 ? (
            <EmptyState title="Aucun achat pour l'instant" />
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Client</th><th>Poste</th><th>Formule</th><th className="text-right">Montant</th><th>Paiement</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const st = ORDER_STATUS[o.status as keyof typeof ORDER_STATUS] ?? ORDER_STATUS.pending;
                    return (
                      <tr key={o.id}>
                        <td className="whitespace-nowrap">{formatDate(o.createdAt, true)}</td>
                        <td>
                          {o.customerName}
                          <div className="text-xs text-slate-500">{[o.phone, o.email].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="font-mono">{o.installId}</td>
                        <td className="whitespace-nowrap">{o.plan} · {LICENSE_DURATIONS[o.duration as keyof typeof LICENSE_DURATIONS]}</td>
                        <td className="text-right tabular-nums">{formatMoney(o.amount, o.currency)}</td>
                        <td className="whitespace-nowrap text-xs">
                          {o.provider === "simulation" ? "Test" : o.network ? NETWORKS[o.network as keyof typeof NETWORKS] : "PayGate"}
                          <div className="text-slate-500">{o.reference}{o.paymentRef ? ` · ${o.paymentRef}` : ""}</div>
                        </td>
                        <td>
                          <Badge tone={st.tone === "slate" ? "gray" : st.tone}>{st.label}</Badge>
                          {o.failureReason && <div className="mt-1 max-w-[14rem] text-xs text-red-700">{o.failureReason}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
        <Card title="Tarifs de la vente en ligne">
          <p className="mb-3 text-sm text-slate-600">Montants en FCFA. Décochez « En vente » pour retirer une durée de la page d&apos;achat.</p>
          <div className="space-y-2">
            {prices.map((p) => (
              <ActionForm key={p.id} action={savePriceAction} className="flex flex-wrap items-center gap-2 text-sm" showOk={false}>
                <input type="hidden" name="plan" value={p.plan} />
                <input type="hidden" name="duration" value={p.duration} />
                <span className="w-44">{p.plan} · {LICENSE_DURATIONS[p.duration as keyof typeof LICENSE_DURATIONS]}</span>
                <input name="amount" defaultValue={p.amount} inputMode="numeric" className="input w-32 text-right tabular-nums" aria-label={`Prix ${p.plan} ${p.duration}`} />
                <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" name="isActive" defaultChecked={p.isActive} /> En vente</label>
                <SubmitButton className="btn-secondary px-2 py-1 text-xs" pendingText="…">Enregistrer</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
        <Card title="Créer un code à la main">
          {canIssueLicenses() ? (
            <LicenseGenerator
              action={issueLicenseAction}
              plans={Object.values(LICENSE_PLANS)}
              durations={Object.entries(LICENSE_DURATIONS).map(([value, label]) => ({ value, label }))}
            />
          ) : (
            <p className="text-sm text-amber-800">
              La clé privée des licences n&apos;est pas configurée sur ce serveur. Ajoutez la ligne LICENSE_PRIVATE_KEY=… dans le fichier .env puis redémarrez.
            </p>
          )}
        </Card>
        <Card title="Codes déjà créés" className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState title="Aucun code créé pour l'instant" />
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Client</th><th>Poste</th><th>Formule</th><th>Fin</th><th>Code</th></tr>
                </thead>
                <tbody>
                  {rows.map(({ issue: r, createdBy }) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap" title={createdBy ?? undefined}>{formatDate(r.createdAt)}</td>
                      <td>{r.customer ?? "—"}</td>
                      <td className="font-mono">{r.installId}</td>
                      <td>{r.plan}</td>
                      <td className="whitespace-nowrap">{r.expiresAt ? formatDate(r.expiresAt) : "À vie"}</td>
                      <td className="max-w-[16rem] truncate font-mono text-xs" title={r.code}>{r.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
