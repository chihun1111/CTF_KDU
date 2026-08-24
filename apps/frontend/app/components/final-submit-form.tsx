"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitFinalFlags } from "../lib/client-api";
import { FLAG_IDS, type FinalSubmitResult, type FlagId } from "../lib/types";

type FinalSubmitFormProps = {
  initialResults: Partial<Record<FlagId, { correct: boolean }>>;
  initialCorrectCount: number;
  requiredCount: number;
};

const flagPrefix = "KDUCTF";
const flagExampleSuffix = "{...}";
const flagExample = [flagPrefix, flagExampleSuffix].join("");
const flagPattern = new RegExp(`^${flagPrefix}\\{[^\\r\\n{}]{1,220}\\}$`);

function initialValues(): Record<FlagId, string> {
  return Object.fromEntries(FLAG_IDS.map((flagId) => [flagId, ""])) as Record<FlagId, string>;
}

export function FinalSubmitForm({ initialResults, initialCorrectCount, requiredCount }: FinalSubmitFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<FlagId, string>>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FlagId, string>>>({});
  const [result, setResult] = useState<FinalSubmitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): boolean {
    const nextErrors: Partial<Record<FlagId, string>> = {};
    let filledCount = 0;
    for (const flagId of FLAG_IDS) {
      const value = values[flagId].trim();
      if (!value) {
        continue;
      }
      filledCount += 1;
      if (!flagPattern.test(value)) {
        nextErrors[flagId] = `${flagExample} 형식의 전체 문자열을 한 줄로 입력합니다.`;
      }
    }
    if (filledCount === 0) {
      nextErrors["FLAG-01"] = "확인할 플래그를 한 개 이상 입력합니다.";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setResult(null);
    if (!validate() || pending) {
      return;
    }

    setPending(true);
    try {
      const submittedEntries = FLAG_IDS
        .map((flagId) => [flagId, values[flagId].trim()] as const)
        .filter(([, value]) => value.length > 0);
      const { response, body } = await submitFinalFlags(Object.fromEntries(submittedEntries) as Partial<Record<FlagId, string>>);

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (response.status === 429) {
        setMessage("잠시 후 다시 시도해주세요.");
        return;
      }

      if (!response.ok) {
        setMessage("제출을 처리하지 못했습니다. 입력값을 확인해주세요.");
        return;
      }

      if (body?.cleared && body.clearRedirectTo === "/clear") {
        window.location.assign("/clear");
        return;
      }

      if (body) {
        setResult(body);
        setMessage(body.message);
      }
    } catch {
      setMessage("제출을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPending(false);
    }
  }

  const displayResults = result?.resultsByFlagId ?? initialResults;
  const correctCount = result?.correctCount ?? initialCorrectCount;

  return (
    <form className="panel submitGrid" onSubmit={submit}>
      <div className="submitFields">
        <div className="resultBanner">
          <strong>최근 제출 결과</strong>
          <span>
            {requiredCount}개 중 {correctCount}개 일치
          </span>
        </div>

        {message ? <p className="formNotice">{message}</p> : null}

        {FLAG_IDS.map((flagId) => (
          <label className="field flagField" key={flagId}>
            <span>플래그 입력 {Number(flagId.slice(-2))}</span>
            <input
              autoComplete="off"
              name={`flagsByFlagId.${flagId}`}
              placeholder={flagExample}
              value={values[flagId]}
              onChange={(event) => setValues((current) => ({ ...current, [flagId]: event.target.value }))}
            />
            {fieldErrors[flagId] ? <small className="fieldError">{fieldErrors[flagId]}</small> : null}
            {displayResults[flagId] ? (
              <small className={displayResults[flagId]?.correct ? "resultGood" : "resultBad"}>
                {displayResults[flagId]?.correct ? "일치" : "불일치"}
              </small>
            ) : null}
          </label>
        ))}
      </div>

      <aside className="submitAside">
        <p className="eyebrow">제출 현황</p>
        <h2>최종 확인 안내</h2>
        <div className="submitProgress" aria-label={`전체 ${requiredCount}개 중 ${correctCount}개 일치`}>
          <span>현재 확인된 항목</span>
          <strong>{correctCount} / {requiredCount}</strong>
        </div>
        <p>찾은 플래그를 한 개 이상 빈 칸에 입력하면 채운 항목만 먼저 확인할 수 있습니다. 칸 위치와 플래그 번호가 달라도 서버가 실제 일치 항목을 찾아 판정합니다.</p>
        <p>
          각 값은 <code>{flagExample}</code> 형식의 사용자별 전체 문자열이어야 합니다.
        </p>
        <p>클리어 인증 정보는 URL이나 브라우저 저장소가 아니라 서버 cookie로만 처리합니다.</p>
        <button className="primaryButton" disabled={pending} type="submit">
          {pending ? "검증 중" : "최종 제출"}
        </button>
      </aside>
    </form>
  );
}
