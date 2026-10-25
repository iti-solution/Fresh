import { redirect } from "next/navigation";
import { homePathForRole } from "@/modules/tenancy/domain/access";
import { requireTenantContext } from "@/modules/tenancy/server/context";

export default async function Home() {
  const ctx = await requireTenantContext();
  redirect(homePathForRole(ctx.role));
}
