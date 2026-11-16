import type { PublicService } from "../../lib/types";

type ServiceDirectoryCardProps = {
  service: PublicService;
};

export function ServiceDirectoryCard({ service }: ServiceDirectoryCardProps) {
  return (
    <article className="serviceDirectoryCard" aria-labelledby={`challenge-${service.id}-title`}>
      <div className="serviceCardTop">
        <span className="serviceNumber">문제 {service.id}</span>
        <span className="difficultyBadge" data-level={service.difficultyLevel} aria-label={`난이도 ${service.difficulty}`}>
          {service.difficulty}
        </span>
      </div>
      <div className="serviceCardBody">
        <p className="serviceCategory">{service.category}</p>
        <h3 id={`challenge-${service.id}-title`}>{service.title}</h3>
        <p>{service.summary}</p>
      </div>
      <div className="serviceCardFooter">
        <a className="primaryLink" href={service.serviceHref} aria-label={`${service.id}번 ${service.title} 문제 풀기`}>
          {service.actionLabel}
        </a>
      </div>
    </article>
  );
}
