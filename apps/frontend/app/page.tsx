import { redirect } from "next/navigation";
import { getCurrentSession } from "./lib/server-api";

export default async function HomePage() {
  const session = await getCurrentSession();
  redirect(session.authenticated ? session.role === "admin" ? "/admin/operations" : "/hub" : "/login");
}
