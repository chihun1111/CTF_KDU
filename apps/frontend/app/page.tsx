import { redirect } from "next/navigation";
import { getCurrentSession } from "./lib/server-api";

export default async function HomePage() {
  const session = await getCurrentSession();
  redirect(session.authenticated ? "/hub" : "/login");
}
