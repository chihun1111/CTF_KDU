import React from "react";
import { FLAG_IDS, type FlagId } from "../lib/types";

export function FlagResultList({ results }: {
  results: Partial<Record<FlagId, { correct: boolean }>>;
}) {
  return (
    <ol className="flagResultList" aria-label="번호별 확인 결과">
      {FLAG_IDS.map((flagId) => {
        const correct = results[flagId]?.correct;
        const label = correct === true ? "일치" : correct === false ? "불일치" : "미제출";
        const className = correct === true ? "resultGood" : correct === false ? "resultBad" : "resultUnsubmitted";
        return (
          <li className={className} key={flagId}>
            <span>{flagId.slice(-2)}번</span> <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
