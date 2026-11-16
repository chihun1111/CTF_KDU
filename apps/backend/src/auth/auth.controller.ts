import { Body, Controller, Get, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import { CryptoService } from "../crypto/crypto.service.js";
import { AuthLoginService } from "./auth-login.service.js";
import { AuthLogoutService } from "./auth-logout.service.js";
import { AuthRateLimiterService } from "./auth-rate-limiter.service.js";
import { AuthRegistrationService } from "./auth-registration.service.js";
import { LoginRequestDto, RegisterRequestDto, parseLoginRequest, parseRegisterRequest } from "./dto/auth.dto.js";
import { SessionAuthService } from "./session-auth.service.js";

type HeaderWriter = {
  setHeader(name: string, value: string): void;
};

type RegistrationHandler = Pick<AuthRegistrationService, "register">;
type LoginHandler = Pick<AuthLoginService, "login">;
type LogoutHandler = Pick<AuthLogoutService, "logout">;
type SessionReader = Pick<SessionAuthService, "authenticateCookieHeader">;
type AuthRateLimiter = Pick<AuthRateLimiterService, "checkRegister" | "checkLogin">;
type AuthRequestHasher = Pick<CryptoService, "requestMetadataHash" | "studentIdHash">;
type RequestMetadata = {
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
};

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject(AuthRegistrationService) private readonly registration: RegistrationHandler,
    @Inject(AuthLoginService) private readonly loginHandler: LoginHandler,
    @Inject(AuthLogoutService) private readonly logoutHandler: LogoutHandler,
    @Inject(SessionAuthService) private readonly sessionReader: SessionReader,
    @Inject(AuthRateLimiterService) private readonly rateLimiter: AuthRateLimiter,
    @Inject(CryptoService) private readonly requestHasher: AuthRequestHasher,
  ) {}

  @Post("register")
  async register(
    @Body() input: RegisterRequestDto,
    @Res({ passthrough: true }) response: HeaderWriter,
    @Req() request: RequestMetadata = {},
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    input = parseRegisterRequest(input);
    const ipHash = this.requestHasher.requestMetadataHash(this.clientIp(request));
    await this.rateLimiter.checkRegister(ipHash);
    const result = await this.registration.register({
      input,
      ipHash,
      userAgentHash: this.requestHasher.requestMetadataHash(userAgent?.trim() || "unknown"),
    });
    response.setHeader("Set-Cookie", result.setCookie);
    response.setHeader("Cache-Control", "no-store");
    return result.body;
  }

  @Post("login")
  async login(
    @Body() input: LoginRequestDto,
    @Res({ passthrough: true }) response: HeaderWriter,
    @Req() request: RequestMetadata = {},
  ) {
    input = parseLoginRequest(input);
    await this.rateLimiter.checkLogin(
      this.requestHasher.requestMetadataHash(this.clientIp(request)),
      this.requestHasher.studentIdHash(input.studentId),
    );
    const result = await this.loginHandler.login(input);
    response.setHeader("Set-Cookie", result.setCookie);
    response.setHeader("Cache-Control", "no-store");
    return result.body;
  }

  @Post("logout")
  async logout(@Headers("cookie") cookieHeader: string | undefined, @Res({ passthrough: true }) response: HeaderWriter) {
    const result = await this.logoutHandler.logout(cookieHeader);
    response.setHeader("Set-Cookie", result.setCookie);
    response.setHeader("Cache-Control", "no-store");
    return result.body;
  }

  @Get("me")
  async me(@Headers("cookie") cookieHeader: string | undefined) {
    const session = await this.sessionReader.authenticateCookieHeader(cookieHeader);
    if (!session) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      role: session.role,
    };
  }

  private clientIp(request: RequestMetadata): string {
    return request.ip ?? request.socket?.remoteAddress ?? "unknown";
  }
}
