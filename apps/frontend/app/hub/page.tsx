import { redirect } from "next/navigation";

/** Compatibility for old bookmarks; the main page owns the participant list. */
export default function HubPage() {
  redirect("/");
}
