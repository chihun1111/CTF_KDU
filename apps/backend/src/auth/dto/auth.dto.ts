import { Type } from "class-transformer";
import { Equals, IsBoolean, IsOptional, IsString, Length, Matches, ValidateNested } from "class-validator";

export class ConsentDto {
  @IsString()
  @Length(1, 80)
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
  @ValidateNested()
  @Type(() => ConsentDto)
  consent!: ConsentDto;
}
