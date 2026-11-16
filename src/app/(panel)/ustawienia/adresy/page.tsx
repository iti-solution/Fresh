import type { Metadata } from "next";
import { InlineForm } from "@/components/forms/inline-form";
import { PageHeader, Panel } from "@/components/panel/page";
import { Input } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/status";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/modules/tenancy/domain/access";
import { requireAccess } from "@/modules/tenancy/server/context";
import { savePointType } from "@/modules/tenancy/server/settings-actions";

export const metadata: Metadata = { title: "Typy adresów dostaw" };

export default async function Page() {
  const ctx = await requireAccess("/ustawienia/adresy");
  const editable = canEdit(ctx.role);
  const supabase = await createClient();
  const [typesRes, countsRes] = await Promise.all([
    supabase.from("point_types").select("id, name, is_temporary, is_active, sort").eq("tenant_id", ctx.tenantId).order("sort").order("name"),
    supabase.from("delivery_points").select("point_type_id").eq("tenant_id", ctx.tenantId),
  ]);
  for (const r of [typesRes, countsRes]) if (r.error) throw r.error;
  const count = new Map<string, number>();
  for (const p of countsRes.data ?? []) if (p.point_type_id) count.set(p.point_type_id, (count.get(p.point_type_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Typy adresów dostaw" description="Dopasuj listę typów do swoich odbiorców — sklep, lokal, zakład, budowa, adres prywatny." />
      <Panel
        className="max-w-4xl"
        title="Typy adresów dostawy"
        description="Dopasuj listę do swoich odbiorców. „Adres tymczasowy” (np. budowa) pokazuje daty czynności i osobę na miejscu."
        flush
      >
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Typ</th>
              <th className="px-4 py-2 font-medium">Adresów</th>
              <th className="px-4 py-2 font-medium">Zmień</th>
            </tr>
          </thead>
          <tbody>
            {(typesRes.data ?? []).map((t) => (
              <tr key={t.id} className="border-t border-border align-top">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{t.name}</span> {t.is_temporary && <Pill tone="warning">tymczasowy</Pill>}{" "}
                  {!t.is_active && <Pill>ukryty</Pill>}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{count.get(t.id) ?? 0}</td>
                <td className="px-4 py-2">
                  {editable ? (
                    <InlineForm
                      action={savePointType.bind(null, t.id)}
                      submitLabel="Zapisz"
                      variant="outline"
                      resetOnSuccess={false}
                    >
                      <Input name="name" defaultValue={t.name} aria-label="Nazwa typu" className="h-8 w-44" />
                      <label className="flex h-8 items-center gap-1.5 text-xs">
                        <input type="checkbox" name="is_temporary" defaultChecked={t.is_temporary} /> tymczasowy
                      </label>
                      <label className="flex h-8 items-center gap-1.5 text-xs">
                        <input type="checkbox" name="is_active" defaultChecked={t.is_active} /> w użyciu
                      </label>
                    </InlineForm>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="border-t border-border p-4">
            <InlineForm action={savePointType.bind(null, null)} submitLabel="Dodaj typ">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Nowy typ
                <Input name="name" placeholder="np. Hotel, Szkoła, Plac budowy" className="w-64" />
              </label>
              <label className="flex h-8 items-center gap-1.5 text-xs">
                <input type="checkbox" name="is_temporary" /> adres tymczasowy
              </label>
            </InlineForm>
          </div>
        )}
      </Panel>


    </>
  );
}
