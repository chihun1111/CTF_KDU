import type { PublicService } from "../../lib/types";

type ServiceDirectoryCardProps = {
  service: PublicService;
};

export function ServiceDirectoryCard({ service }: ServiceDirectoryCardProps) {
  return (
    <article className="serviceDirectoryCard">
      <div className="serviceCardTop">
        <span className="serviceState">이용 가능</span>
        <span className="serviceNumber" aria-hidden="true">{service.id}</span>
      </div>
      <div className="serviceCardBody">
        <p className="serviceDepartment">{service.department}</p>
        <h2>{service.title}</h2>
        <p>{service.summary}</p>
      </div>
      <div className="serviceCardFooter">
        <span className="serviceDate">최근 갱신 {service.updatedAt}</span>
        <a className="primaryLink" href={service.serviceHref}>
          {service.actionLabel}
        </a>
      </div>
    </article>
  );
}
