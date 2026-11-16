import { BadRequestException } from "@nestjs/common";
import { plainToInstance, Type } from "class-transformer";
import { Equals, IsBoolean, IsDefined, IsObject, IsOptional, IsString, Length, Matches, ValidateNested, validateSync } from "class-validator";

export class ConsentDto {
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  consentVersion!: string;

  @Equals(true, { message: "requiredLoggingAccepted must be true" })
  requiredLoggingAccepted!: true;

  @IsOptional()
  @IsBoolean()
  analyticsLoggingAccepted?: boolean;

  @Equals(true, { message: "cookieAccepted must be true" })
  cookieAccepted!: true;
}

export class LoginRequestDto {
  @Matches(/^\d{7}$/, { message: "studentId must be exactly 7 digits" })
  studentId!: string;

  @IsString()
  @Length(8, 128, { message: "password must be 8 to 128 characters" })
  password!: string;
}

export class RegisterRequestDto extends LoginRequestDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ConsentDto)
  consent!: ConsentDto;
}

function parseRequest<T extends object>(type: new () => T, input: unknown): T {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestException("Invalid authentication request");
  }
  const dto = plainToInstance(type, input);
  if (validateSync(dto, { whitelist: true, forbidUnknownValues: true }).length > 0) {
    throw new BadRequestException("Invalid authentication request");
  }
  return dto;
}

export function parseLoginRequest(input: unknown): LoginRequestDto {
  return parseRequest(LoginRequestDto, input);
}

export function parseRegisterRequest(input: unknown): RegisterRequestDto {
  return parseRequest(RegisterRequestDto, input);
}
