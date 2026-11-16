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
    password: "ValidPassword8",
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
    password: "ValidPassword8",
  });

  assert.deepEqual(await validationErrors(dto), []);
});

test("login and registration accept only exact ASCII alphanumeric passwords of 8 to 128 characters", () => {
  const consent = { consentVersion: "password-policy", requiredLoggingAccepted: true, cookieAccepted: true };
  const accepted = ["abcdefgh", "ABCDEFGH", "12345678", "ValidPassword8", "A".repeat(128), "9".repeat(128),
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"];
  for (const password of accepted) {
    const input = { studentId: "2622022", password, consent };
    assert.equal(parseLoginRequest(input).password, password);
    assert.equal(parseRegisterRequest(input).password, password);
  }
  for (const password of ["", "a".repeat(7), "a".repeat(129), null, undefined, true, 12345678, [], {}, { toString: () => "ValidPassword8" }]) {
    const input = { studentId: "2622022", password, consent };
    assert.throws(() => parseLoginRequest(input), BadRequestException);
    assert.throws(() => parseRegisterRequest(input), BadRequestException);
  }
});

test("authentication rejects every ASCII special character, controls, whitespace, emoji and other non-ASCII input", () => {
  const consent = { consentVersion: "password-policy", requiredLoggingAccepted: true, cookieAccepted: true };
  const rejected = ["한글abcd1234", "éabcd1234", "😀".repeat(8), "😀\uFE0F".repeat(128), "\uFFFD".repeat(8),
    "\uD800".repeat(8), "\uDC00".repeat(8), "ValidPassword8\uDC00\uD800", "１２３４５６７８", "ValidPassword8\u00A0",
    " ValidPassword8", "ValidPassword8 ", "ValidPassword8\r\n"];
  for (let code = 0; code < 128; code += 1) {
    const character = String.fromCharCode(code);
    if (!/[A-Za-z0-9]/.test(character)) rejected.push(`ValidPassword8${character}`);
  }
  for (const password of rejected) {
    const input = { studentId: "2622022", password, consent };
    assert.throws(() => parseLoginRequest(input), BadRequestException);
    assert.throws(() => parseRegisterRequest(input), BadRequestException);
  }
});

test("student IDs require exactly seven digits including at the absolute end of input", () => {
  for (const studentId of ["2622022\n", "2622022\r", "2622022\r\n", "2622022\u2028", " 2622022", "2622022 "]) {
    const input = { studentId, password: "ValidPassword8", consent: { consentVersion: "id-policy", requiredLoggingAccepted: true, cookieAccepted: true } };
    assert.throws(() => parseLoginRequest(input), BadRequestException);
    assert.throws(() => parseRegisterRequest(input), BadRequestException);
  }
});

test("registration requires a single consent object, including when called outside ValidationPipe", async () => {
  for (const consent of [undefined, null, [], "yes", {}]) {
    const input = { studentId: "2622022", password: "ValidPassword8", consent };
    assert((await validationErrors(plainToInstance(RegisterRequestDto, input))).length > 0);
    assert.throws(() => parseRegisterRequest(input), BadRequestException);
  }
  for (const input of [null, undefined, [], "credentials", { studentId: 2622022, password: "ValidPassword8" }]) {
    assert.throws(() => parseLoginRequest(input), BadRequestException);
  }
});
