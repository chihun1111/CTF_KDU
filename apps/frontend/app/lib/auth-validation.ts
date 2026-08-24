import { z } from "zod";

export const consentVersion = "campus-ctf-2026-required-v1";

export const studentIdSchema = z.string().regex(/^\d{7}$/, {
  error: "학번은 7자리 숫자 문자열입니다.",
});

export const passwordSchema = z.string().min(8).max(128);

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
