export type FlagId = `FLAG-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export { PUBLIC_CHALLENGE_CATALOG } from "./challenge-catalog.js";
export type { ChallengeDifficulty, ChallengeDifficultyLevel, PublicService } from "./challenge-catalog.js";

export const FLAG_IDS = [
  "FLAG-01",
  "FLAG-02",
  "FLAG-03",
  "FLAG-04",
  "FLAG-05",
  "FLAG-06",
  "FLAG-07",
  "FLAG-08",
] as const satisfies readonly FlagId[];

export type ChallengeNumber = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08";

export function challengeNumberOfFlagId(flagId: FlagId): ChallengeNumber {
  return flagId.slice("FLAG-".length) as ChallengeNumber;
}

export function flagIdOfChallengeNumber(challengeNumber: string): FlagId | null {
  return FLAG_IDS.find((flagId) => flagId.endsWith(`-${challengeNumber}`)) ?? null;
}
