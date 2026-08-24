import { Module } from "@nestjs/common";
import { CryptoModule } from "../crypto/crypto.module.js";
import { CryptoService } from "../crypto/crypto.service.js";
import { DATABASE_CLIENT, DatabaseModule } from "../database/database.module.js";
import { FlagsModule } from "../flags/flags.module.js";
import { FlagIssuanceService } from "../flags/flag-issuance.service.js";
import { UsersModule } from "../users/users.module.js";
import { AdminRoleGuard } from "./admin-role.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthLoginService, type LoginStore } from "./auth-login.service.js";
import { AuthLogoutService, type LogoutStore } from "./auth-logout.service.js";
import { AuthRateLimiterService } from "./auth-rate-limiter.service.js";
import { AuthRegistrationService, type RegistrationStore } from "./auth-registration.service.js";
import { LoginDrizzleStore } from "./login-drizzle.store.js";
import { PasswordHashService } from "./password-hash.service.js";
import { RegistrationDrizzleStore } from "./registration-drizzle.store.js";
import { SessionAuthDrizzleStore } from "./session-auth-drizzle.store.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionAuthService, type SessionAuthStore } from "./session-auth.service.js";
import { SessionCookieService } from "./session-cookie.service.js";

export const REGISTRATION_STORE = Symbol("REGISTRATION_STORE");
export const LOGIN_STORE = Symbol("LOGIN_STORE");
export const SESSION_AUTH_STORE = Symbol("SESSION_AUTH_STORE");

@Module({
  imports: [DatabaseModule, CryptoModule, UsersModule, FlagsModule],
  controllers: [AuthController],
  providers: [
    PasswordHashService,
    SessionCookieService,
    AuthRateLimiterService,
    SessionAuthGuard,
    AdminRoleGuard,
    {
      provide: REGISTRATION_STORE,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof RegistrationDrizzleStore>[0]) =>
        new RegistrationDrizzleStore(databaseClient),
    },
    {
      provide: LOGIN_STORE,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof LoginDrizzleStore>[0]) =>
        new LoginDrizzleStore(databaseClient),
    },
    {
      provide: SESSION_AUTH_STORE,
      inject: [DATABASE_CLIENT],
      useFactory: (databaseClient: ConstructorParameters<typeof SessionAuthDrizzleStore>[0]) =>
        new SessionAuthDrizzleStore(databaseClient),
    },
    {
      provide: AuthRegistrationService,
      inject: [REGISTRATION_STORE, CryptoService, PasswordHashService, FlagIssuanceService, SessionCookieService],
      useFactory: (
        store: RegistrationStore,
        crypto: CryptoService,
        passwordHash: PasswordHashService,
        flagIssuance: FlagIssuanceService,
        sessionCookie: SessionCookieService,
      ) => new AuthRegistrationService(store, crypto, passwordHash, flagIssuance, sessionCookie),
    },
    {
      provide: AuthLoginService,
      inject: [LOGIN_STORE, CryptoService, PasswordHashService, SessionCookieService],
      useFactory: (
        store: LoginStore,
        crypto: CryptoService,
        passwordHash: PasswordHashService,
        sessionCookie: SessionCookieService,
      ) => new AuthLoginService(store, crypto, passwordHash, sessionCookie),
    },
    {
      provide: SessionAuthService,
      inject: [SESSION_AUTH_STORE, CryptoService],
      useFactory: (store: SessionAuthStore, crypto: CryptoService) => new SessionAuthService(store, crypto),
    },
    {
      provide: AuthLogoutService,
      inject: [SessionAuthService, SESSION_AUTH_STORE, SessionCookieService],
      useFactory: (sessionAuth: SessionAuthService, store: LogoutStore, sessionCookie: SessionCookieService) =>
        new AuthLogoutService(sessionAuth, store, sessionCookie),
    },
  ],
  exports: [
    AuthRegistrationService,
    AuthLoginService,
    AuthLogoutService,
    AuthRateLimiterService,
    SessionAuthService,
    SessionAuthGuard,
    AdminRoleGuard,
    PasswordHashService,
    SessionCookieService,
  ],
})
export class AuthModule {}
