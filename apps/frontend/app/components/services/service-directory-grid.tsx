"use client";

import { useState } from "react";
import type { ChallengeDifficulty, PublicService } from "../../lib/types";
import { ServiceDirectoryCard } from "./service-directory-card";

type ServiceDirectoryGridProps = {
  services: PublicService[];
};

export function ServiceDirectoryGrid({ services }: ServiceDirectoryGridProps) {
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty | "전체">("전체");
  const options = ["전체", "입문", "초급", "중급", "고급"] as const;
  const visible = difficulty === "전체" ? services : services.filter((service) => service.difficulty === difficulty);

  return (
    <>
      <div className="difficultyFilters" role="group" aria-label="난이도 필터">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={difficulty === option} aria-controls="challenge-grid" onClick={() => setDifficulty(option)}>
            <span>{option}</span>
            <span className="filterCount" aria-hidden="true">{option === "전체" ? services.length : services.filter((service) => service.difficulty === option).length}</span>
          </button>
        ))}
      </div>
      <p className="filterSummary" role="status" aria-live="polite">{difficulty} · {visible.length}개 문제</p>
      <div className="serviceDirectoryGrid" id="challenge-grid">
        {visible.map((service) => <ServiceDirectoryCard key={service.slug} service={service} />)}
      </div>
      {visible.length === 0 ? <p className="panel emptyState">현재 공개된 {difficulty} 문제는 없습니다. 다른 난이도를 선택해 주세요.</p> : null}
    </>
  );
}
