import { redirect } from "next/navigation";

// Ekran jest częścią aplikacji trasy (działa offline) — stary adres przekierowuje.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/driver/trasa/${id}`);
}
