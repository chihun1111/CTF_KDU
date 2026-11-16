import { z } from "zod";
import type { SessionState } from "./types";

export const consentVersion = "campus-ctf-2026-required-v1";

export const studentIdSchema = z.string().regex(/^\d{7}$/, {
  error: "학번은 7자리 숫자 문자열입니다.",
});

// Match validator.js isLength, used by the backend's class-validator @Length.
// Its contract subtracts surrogate and FE0E/FE0F presentation pairs from UTF-16
// length; it does not count general grapheme clusters. Keep these regexes without
// the Unicode flag so consecutive selectors follow the same backend semantics.
export const passwordSchema = z.string().refine((value) => {
  const presentationPairs = value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g)?.length ?? 0;
  const surrogatePairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0;
  const length = value.length - presentationPairs - surrogatePairs;
  return length >= 8 && length <= 128;
}, { error: "비밀번호는 8자 이상 128자 이하로 입력합니다." });

const sessionSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false) }),
  z.object({ authenticated: z.literal(true), role: z.enum(["participant", "admin"]) }),
]);

export function readSessionState(value: unknown): SessionState {
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("인증 서비스의 응답을 확인하지 못했습니다.");
  }
  return parsed.data;
}

export const loginFormSchema = z.object({
  studentId: studentIdSchema,
  password: passwordSchema,
});

export const registerFormSchema = loginFormSchema.extend({
  consent: z.object({
    consentVersion: z.string().min(1),
    requiredLoggingAccepted: z.literal(true),
    analyticsLoggingAccepted: z.boolean(),
    cookieAccepted: z.literal(true),
  }),
});

export type LoginFormValues = z.input<typeof loginFormSchema>;
export type RegisterFormValues = z.input<typeof registerFormSchema>;
