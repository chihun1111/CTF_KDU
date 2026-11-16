import { FLAG_IDS, type FlagId } from "./types";

const flagPattern = new RegExp("^KDUCTF" + "\\{[^\\r\\n{}]{1,200}\\}$");

/** Match the backend's complete-flag format, including the 200-character payload cap. */
export function validateSubmissionFlags(values: Record<FlagId, string>): Partial<Record<FlagId, string>> {
  const errors: Partial<Record<FlagId, string>> = {};
  let submittedCount = 0;
  for (const flagId of FLAG_IDS) {
    const value = values[flagId].trim();
    if (!value) continue;
    submittedCount += 1;
    if (!flagPattern.test(value)) {
      errors[flagId] = "KDUCTF 형식의 전체 문자열을 한 줄로 입력합니다. 중괄호 안은 1자 이상 200자 이하입니다.";
    }
  }
  if (submittedCount === 0) {
    errors["FLAG-01"] = "확인할 플래그를 한 개 이상 입력합니다.";
  }
  return errors;
}
