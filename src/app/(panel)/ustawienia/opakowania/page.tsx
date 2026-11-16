import type { Metadata } from "next";
import { InlineForm } from "@/components/forms/inline-form";
import { PageHeader, Panel } from "@/components/panel/page";
import { Input } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import { savePackagingType } from "@/modules/tenancy/server/settings-actions";

export const metadata: Metadata = { title: "Opakowania" };

export default async function Page() {
  const ctx = await requireAccess("/ustawienia/opakowania");
  const editable = canEdit(ctx.role);
  const supabase = await createClient();
  const packRes = await supabase
    .from("packaging_types")
    .select("id, code, name, deposit_value, is_active")
    .eq("tenant_id", ctx.tenantId)
    .order("code");
  if (packRes.error) throw packRes.error;

  return (
    <>
      <PageHeader title="Opakowania" description="Palety, skrzynki, kegi — kierowca wpisuje wydane i odebrane na punkcie, a saldo i kaucja liczą się same." />
      <Panel
        className="max-w-4xl"
        title="Opakowania zwrotne"
        description="Palety, skrzynki, kegi… Kierowca wpisuje wydane i odebrane na punkcie, a saldo i kaucja liczą się same."
        flush
      >
        <ul className="divide-y divide-border text-sm">
          {(packRes.data ?? []).length === 0 && <li className="px-4 py-3 text-muted">Brak typów opakowań.</li>}
          {(packRes.data ?? []).map((t) => (
            <li key={t.id} className="px-4 py-2">
              {editable ? (
                <InlineForm
                  action={savePackagingType.bind(null, t.id)}
                  submitLabel="Zapisz"
                  variant="outline"
                  resetOnSuccess={false}
                >
                  <Input name="code" defaultValue={t.code} aria-label="Kod" className="h-8 w-28 font-mono" />
                  <Input name="name" defaultValue={t.name} aria-label="Nazwa" className="h-8 w-48" />
                  <Input
                    name="deposit_value"
                    defaultValue={t.deposit_value ?? ""}
                    aria-label="Kaucja (zł)"
                    placeholder="kaucja zł"
                    className="h-8 w-28"
                  />
                  <label className="flex h-8 items-center gap-1.5 text-xs">
                    <input type="checkbox" name="is_active" defaultChecked={t.is_active} /> w użyciu
                  </label>
                </InlineForm>
              ) : (
                <span>
                  <code className="font-mono">{t.code}</code> {t.name} {t.deposit_value ? `· kaucja ${t.deposit_value} zł` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="border-t border-border p-4">
            <InlineForm action={savePackagingType.bind(null, null)} submitLabel="Dodaj opakowanie">
              <Input name="code" placeholder="kod, np. EUR" aria-label="Kod" className="w-28 font-mono" />
              <Input name="name" placeholder="nazwa, np. Paleta EUR" aria-label="Nazwa" className="w-48" />
              <Input name="deposit_value" placeholder="kaucja zł" aria-label="Kaucja (zł)" className="w-28" />
            </InlineForm>
          </div>
        )}
      </Panel>


    </>
  );
}
