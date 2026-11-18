import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AppShell from "./app-shell";

export const metadata = { title: "Contact Extractor" };

export default async function AppPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/app");
  return <AppShell userEmail={data.user.email ?? "account"} />;
}
