import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, SelectField, TableWrap } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/dates";
import { mailEnabled } from "@/lib/mail";
import { listMembers } from "@/modules/users/service";
import { addMemberAction, resetPasswordAction, toggleMemberAction, updateMemberAction } from "./actions";

export const metadata = { title: "Utilisateurs" };

export default async function UsersPage() {
  const ctx = await requireContext("users.manage");
  const { members, roles, stores } = await listMembers(ctx);
  const roleOpts = roles.map((r) => ({ value: r.id, label: r.name }));
  const storeOpts = stores.map((s) => ({ value: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Utilisateurs" actions={<Link href="/users/roles" className="btn-secondary">Rôles et permissions</Link>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <TableWrap>
            <table className="table">
              <thead><tr><th>Utilisateur</th><th>Rôle et boutique</th><th className="hidden md:table-cell">Dernière connexion</th><th /></tr></thead>
              <tbody>
                {members.map((u) => (
                  <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                    <td>
                      <div className="font-medium">{u.fullName} {u.isOwner && <Badge tone="blue">Propriétaire</Badge>}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td>
                      {u.isOwner ? (
                        <span>{u.roleName}</span>
                      ) : (
                        <ActionForm action={updateMemberAction.bind(null, u.id)} className="flex flex-wrap items-center gap-2" showOk={false}>
                          <select name="roleId" defaultValue={u.roleId} className="input w-36">{roleOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                          <select name="storeId" defaultValue={stores.find((s) => s.name === u.storeName)?.id ?? ""} className="input w-36">
                            <option value="">Boutique par défaut</option>
                            {storeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <SubmitButton className="btn-secondary px-3 py-1.5" pendingText="…">OK</SubmitButton>
                        </ActionForm>
                      )}
                    </td>
                    <td className="hidden md:table-cell">{u.lastLoginAt ? formatDate(u.lastLoginAt, true) : "Jamais"}</td>
                    <td className="text-right">
                      {!u.isOwner && u.userId !== ctx.userId && (
                        <ActionForm action={resetPasswordAction.bind(null, u.id)} className="mb-1">
                          <button className="text-xs text-brand-700 hover:underline">Réinitialiser le mot de passe</button>
                        </ActionForm>
                      )}
                      {!u.isOwner && u.userId !== ctx.userId && (
                        <form action={toggleMemberAction.bind(null, u.id, !u.isActive)}>
                          <button className={u.isActive ? "text-xs text-red-600 hover:underline" : "text-xs text-brand-700 hover:underline"}>{u.isActive ? "Désactiver" : "Réactiver"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
        <Card title="Ajouter un utilisateur">
          <ActionForm action={addMemberAction} className="space-y-3" resetOnSuccess>
            <Field label="Nom complet" name="fullName" required />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              hint={mailEnabled() ? "Une vraie adresse : il recevra un code pour la confirmer à sa première connexion" : undefined}
            />
            <Field label="Téléphone" name="phone" type="tel" />
            <Field label="Mot de passe provisoire" name="password" type="text" minLength={8} required hint="Provisoire : il devra le changer à sa première connexion" />
            <SelectField label="Rôle" name="roleId" options={roleOpts} defaultValue={roles.find((r) => r.name === "Caissier")?.id} />
            <SelectField label="Boutique" name="storeId" placeholder="Boutique par défaut" options={storeOpts} />
            <SubmitButton>Ajouter</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
