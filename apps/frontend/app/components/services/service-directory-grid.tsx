import type { PublicService } from "../../lib/types";
import { ServiceDirectoryCard } from "./service-directory-card";

type ServiceDirectoryGridProps = {
  services: PublicService[];
};

export function ServiceDirectoryGrid({ services }: ServiceDirectoryGridProps) {
  return (
    <div className="serviceDirectoryGrid">
      {services.map((service) => (
        <ServiceDirectoryCard key={service.slug} service={service} />
      ))}
    </div>
  );
}
