import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate, type ValidationError } from "class-validator";
import { LoginRequestDto, RegisterRequestDto } from "./auth.dto.js";

function flattenErrorMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...flattenErrorMessages(error.children ?? []),
  ]);
}

async function validationErrors(dto: object): Promise<string[]> {
  const errors = await validate(dto, {
    forbidUnknownValues: true,
    whitelist: true,
  });

  return flattenErrorMessages(errors);
}

test("RegisterRequestDto accepts a 7-digit student id, valid password, and required consent", async () => {
  const dto = plainToInstance(RegisterRequestDto, {
    studentId: "2622022",
    password: "valid-password",
    consent: {
      consentVersion: "2026-ctf-v1",
      requiredLoggingAccepted: true,
      analyticsLoggingAccepted: false,
      cookieAccepted: true,
    },
  });

  assert.deepEqual(await validationErrors(dto), []);
});

test("RegisterRequestDto rejects invalid student id, short password, and missing required consent", async () => {
  const dto = plainToInstance(RegisterRequestDto, {
    studentId: "abc2022",
    password: "short",
    consent: {
      consentVersion: "2026-ctf-v1",
      requiredLoggingAccepted: false,
      cookieAccepted: false,
    },
  });

  const errors = await validationErrors(dto);

  assert(errors.some((message) => message.includes("studentId must be exactly 7 digits")));
  assert(errors.some((message) => message.includes("password must be 8 to 128 characters")));
  assert(errors.some((message) => message.includes("requiredLoggingAccepted must be true")));
  assert(errors.some((message) => message.includes("cookieAccepted must be true")));
});

test("LoginRequestDto uses the same public credential validation as register", async () => {
  const dto = plainToInstance(LoginRequestDto, {
    studentId: "2622022",
    password: "valid-password",
  });

  assert.deepEqual(await validationErrors(dto), []);
});
