import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireContext } from "@/lib/auth/server";
import { MODULE_KEYS, MODULES } from "@/lib/modules";
import { setModulesAction } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Paramètres" };

export default async function ModulesSettingsPage() {
  const ctx = await requireContext("settings.manage");
  const hidden = new Set(ctx.company.hiddenModules);
  const keys = MODULE_KEYS;
  return (
    <>
      <PageHeader title="Paramètres" />
      <SettingsTabs current="modules" />
      <Card title="Modules affichés dans le menu">
        <p className="mb-4 text-sm text-slate-600">
          Décochez ce que vous n&apos;utilisez pas pour garder un menu simple. Rien n&apos;est supprimé : vous pouvez réafficher un module à tout moment.
        </p>
        <ActionForm action={setModulesAction} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {keys.map((k) => (
              <label key={k} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input type="checkbox" name="modules" value={k} defaultChecked={!hidden.has(k)} className="mt-1 accent-brand-700" />
                <span>
                  <span className="block text-sm font-medium">{MODULES[k].label}</span>
                  <span className="block text-xs text-slate-500">{MODULES[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
          <SubmitButton className="btn-primary">Enregistrer</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
