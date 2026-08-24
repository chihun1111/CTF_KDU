import { notFound, redirect } from "next/navigation";
import { getCurrentSession, getServiceHub } from "../../lib/server-api";

type ServicePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function ServicePage({ params }: ServicePageProps) {
  const session = await getCurrentSession();
  if (!session.authenticated) {
    redirect("/login");
  }

  const { slug } = await params;
  const result = await getServiceHub();
  if (!result.ok) {
    if (result.status === 401) {
      redirect("/login");
    }
    if (result.status === 404) {
      notFound();
    }
    throw new Error("Failed to load service list");
  }

  const service = result.data.services.find((item) => item.slug === slug);
  if (!service) {
    notFound();
  }

  redirect(service.serviceHref);
}
