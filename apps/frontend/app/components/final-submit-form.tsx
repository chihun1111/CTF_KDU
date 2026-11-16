"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitFinalFlags } from "../lib/client-api";
import { validateSubmissionFlags } from "../lib/submission-validation";
import { FLAG_IDS, type FinalSubmitResult, type FlagId } from "../lib/types";
import { FlagResultList } from "./flag-result-list";

type FinalSubmitFormProps = {
  initialResults: Partial<Record<FlagId, { correct: boolean }>>;
  initialCorrectCount: number;
  requiredCount: number;
};

const flagPrefix = "KDUCTF";
const flagExampleSuffix = "{...}";
const flagExample = [flagPrefix, flagExampleSuffix].join("");

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    const nextErrors = validateSubmissionFlags(values);
    setFieldErrors(nextErrors);
    const firstInvalid = FLAG_IDS.find((flagId) => nextErrors[flagId] !== undefined);
    if (firstInvalid) {
      const field = event.currentTarget.elements.namedItem(`flagsByFlagId.${firstInvalid}`);
      if (field instanceof HTMLInputElement) field.focus();
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
        setMessage(response.status >= 500
          ? "제출 서비스를 사용할 수 없습니다. 입력한 값은 유지됩니다. 잠시 후 다시 시도해주세요."
          : "제출을 처리하지 못했습니다. 입력값을 확인해주세요.");
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
    <form className="panel submitGrid" onSubmit={submit} aria-busy={pending}>
      <div className="submitFields">
        <div className="resultBanner" aria-live="polite" aria-atomic="true">
          <strong>최근 제출 결과</strong>
          <span>
            {requiredCount}개 중 {correctCount}개 일치
          </span>
        </div>
        <section className="submissionResults" aria-label="최근 제출의 번호별 결과" aria-live="polite" aria-atomic="true">
          <p>입력 칸 순서와 관계없이 확인된 플래그 번호를 표시합니다.</p>
          <FlagResultList results={displayResults} />
        </section>

        {message ? <p className="formNotice" role="status">{message}</p> : null}

        {FLAG_IDS.map((flagId) => (
          <label className="field flagField" key={flagId}>
            <span>플래그 입력 {Number(flagId.slice(-2))}</span>
            <input
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={pending}
              maxLength={512}
              aria-invalid={Boolean(fieldErrors[flagId])}
              aria-describedby={fieldErrors[flagId] ? `${flagId}-error` : undefined}
              name={`flagsByFlagId.${flagId}`}
              placeholder={flagExample}
              value={values[flagId]}
              onChange={(event) => {
                setValues((current) => ({ ...current, [flagId]: event.target.value }));
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next[flagId];
                  return next;
                });
              }}
            />
            {fieldErrors[flagId] ? <small className="fieldError" id={`${flagId}-error`} role="alert">{fieldErrors[flagId]}</small> : null}
          </label>
        ))}
      </div>

      <aside className="submitAside">
        <p className="eyebrow">제출 현황</p>
        <h2>최종 확인 안내</h2>
        <div className="submitProgress" aria-label={`전체 ${requiredCount}개 중 ${correctCount}개 일치`}>
          <span>이번 제출에서 확인한 항목</span>
          <strong>{correctCount} / {requiredCount}</strong>
        </div>
        <p>찾은 플래그를 한 개 이상 빈 칸에 입력하면 채운 항목만 먼저 확인할 수 있습니다. 칸 위치와 플래그 번호가 달라도 서버가 실제 일치 항목을 찾아 판정합니다.</p>
        <p>결과는 이번 제출 기준이며 이전 제출의 정답과 합산하지 않습니다. 최종 완료하려면 찾은 8개 플래그를 한 번에 입력해야 합니다.</p>
        <p>새로고침하면 입력값이 지워집니다. 다른 페이지를 확인하기 전에 찾은 값을 따로 보관해 주세요.</p>
        <p>
          각 값은 <code>{flagExample}</code> 형식의 사용자별 전체 문자열이어야 합니다.
        </p>
        <p>완료 후 나타나는 인증 화면은 한 번만 표시됩니다. 새로고침하기 전에 화면의 촬영 안내를 확인해 주세요.</p>
        <button className="primaryButton" disabled={pending} type="submit">
          {pending ? "검증 중" : "최종 제출"}
        </button>
      </aside>
    </form>
  );
}
