import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { ADMIN_ROLE, PERMISSION_GROUPS, PERMISSIONS } from "@/lib/permissions";
import { listMembers } from "@/modules/users/service";
import { deleteRoleAction, saveRoleAction } from "../actions";

export const metadata = { title: "Rôles et permissions" };

function PermissionChecks({ selected }: { selected: string[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_GROUPS.map((g) => (
        <fieldset key={g.label}>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</legend>
          {g.permissions.map((p) => (
            <label key={p} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" name="permissions" value={p} defaultChecked={selected.includes(p)} className="h-4 w-4 accent-brand-700" />
              {PERMISSIONS[p]}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export default async function RolesPage() {
  const ctx = await requireContext("users.manage");
  const { roles } = await listMembers(ctx);
  return (
    <>
      <PageHeader title="Rôles et permissions" subtitle="Cochez ce que chaque rôle peut faire, ou créez un profil sur mesure en bas de page. Les changements s'appliquent dès la page suivante." />
      <div className="space-y-4">
        {roles.map((r) =>
          r.isSystem && r.name === ADMIN_ROLE ? (
            <Card key={r.id} title={r.name}>
              <p className="text-sm text-slate-600">
                L&apos;administrateur détient tous les droits, y compris ceux ajoutés à l&apos;avenir. Ce rôle ne peut pas être modifié,
                et lui seul peut attribuer le rôle Administrateur.
              </p>
            </Card>
          ) : (
            <Card key={r.id} title={r.isSystem ? r.name : `${r.name} (personnalisé)`}>
              <ActionForm action={saveRoleAction.bind(null, r.id)} className="space-y-4">
                <input type="hidden" name="name" value={r.name} />
                <PermissionChecks selected={r.permissions} />
                <SubmitButton>Enregistrer</SubmitButton>
              </ActionForm>
              {!r.isSystem && (
                <ActionForm action={deleteRoleAction.bind(null, r.id)} className="mt-3">
                  <button type="submit" className="text-sm text-red-600 hover:underline">Supprimer ce rôle</button>
                </ActionForm>
              )}
            </Card>
          ),
        )}
        <Card title="Nouveau rôle">
          <ActionForm action={saveRoleAction.bind(null, null)} className="space-y-4" resetOnSuccess>
            <Field label="Nom du rôle" name="name" required className="max-w-sm" />
            <PermissionChecks selected={[]} />
            <SubmitButton>Créer le rôle</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
