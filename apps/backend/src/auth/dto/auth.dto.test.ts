import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate, type ValidationError } from "class-validator";
import { LoginRequestDto, RegisterRequestDto, parseLoginRequest, parseRegisterRequest } from "./auth.dto.js";
import { BadRequestException } from "@nestjs/common";

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

test("login and registration preserve validator password boundaries for Unicode presentation sequences", () => {
  const cases = [
    { label: "ASCII", unit: "a", accepted: [8, 128], rejected: [7, 129] },
    { label: "supplementary emoji", unit: "😀", accepted: [8, 128], rejected: [7, 129] },
    { label: "emoji presentation", unit: "\u2764\uFE0F", accepted: [8, 128], rejected: [4, 7, 129] },
    { label: "text presentation", unit: "\u2764\uFE0E", accepted: [8, 128], rejected: [7, 129] },
    { label: "supplementary emoji presentation", unit: "😀\uFE0F", accepted: [8, 128], rejected: [7, 129] },
    { label: "consecutive selectors", unit: "a\uFE0F\uFE0E", accepted: [4, 64], rejected: [3, 65] },
    { label: "standalone selectors", unit: "\uFE0F", accepted: [8, 128], rejected: [7, 129] },
    { label: "other BMP variation selector", unit: "a\uFE00", accepted: [4, 64], rejected: [3, 65] },
    { label: "supplementary variation selector", unit: "a\u{E0100}", accepted: [4, 64], rejected: [3, 65] },
    { label: "zero-width joiner sequence", unit: "👩‍💻", accepted: [3, 42], rejected: [2, 43] },
  ];
  const consent = { consentVersion: "unicode-boundaries", requiredLoggingAccepted: true, cookieAccepted: true };
  for (const { label, unit, accepted, rejected } of cases) {
    for (const count of accepted) {
      const password = unit.repeat(count);
      const input = { studentId: "2622022", password, consent };
      assert.equal(parseLoginRequest(input).password, password, `${label} × ${count}`);
      assert.equal(parseRegisterRequest(input).password, password, `${label} × ${count}`);
    }
    for (const count of rejected) {
      const input = { studentId: "2622022", password: unit.repeat(count), consent };
      assert.throws(() => parseLoginRequest(input), BadRequestException, `${label} × ${count}`);
      assert.throws(() => parseRegisterRequest(input), BadRequestException, `${label} × ${count}`);
    }
  }
});

test("registration requires a single consent object, including when called outside ValidationPipe", async () => {
  for (const consent of [undefined, null, [], "yes", {}]) {
    const input = { studentId: "2622022", password: "valid-password", consent };
    assert((await validationErrors(plainToInstance(RegisterRequestDto, input))).length > 0);
    assert.throws(() => parseRegisterRequest(input), BadRequestException);
  }
  for (const input of [null, undefined, [], "credentials", { studentId: 2622022, password: "valid-password" }]) {
    assert.throws(() => parseLoginRequest(input), BadRequestException);
  }
});
