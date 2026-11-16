import { redirect } from "next/navigation";

// Pulpit został zastąpiony przez Centrum operacyjne; stare zakładki i linki trafiają tutaj.
export default function DashboardRedirect() {
  redirect("/centrum");
}
