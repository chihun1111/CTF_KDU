import { z } from "zod";
import type { SessionState } from "./types";

export const consentVersion = "campus-ctf-2026-required-v1";

export const passwordInputMaxLength = 128;

// An absolute end check also rejects final line breaks, which `$` alone permits.
export const studentIdSchema = z.string().regex(/^\d{7}(?![\s\S])/, {
  error: "학번은 7자리 숫자 문자열입니다.",
});

export const passwordSchema = z.string().regex(/^[A-Za-z0-9]{8,128}(?![\s\S])/, {
  error: "비밀번호는 영문 대소문자와 숫자만 사용해 8자 이상 128자 이하로 입력합니다.",
});

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
