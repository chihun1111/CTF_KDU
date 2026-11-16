"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { consentVersion, loginFormSchema, registerFormSchema } from "../lib/auth-validation";
import { authenticatedDestination, loginParticipant, registerParticipant, SessionCookieUnavailableError } from "../lib/client-api";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [requiredLoggingAccepted, setRequiredLoggingAccepted] = useState(false);
  const [analyticsLoggingAccepted, setAnalyticsLoggingAccepted] = useState(false);
  const [cookieAccepted, setCookieAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";
  const isValid = useMemo(() => {
    const input = buildInput();
    return isRegister ? registerFormSchema.safeParse(input).success : loginFormSchema.safeParse(input).success;
  }, [analyticsLoggingAccepted, cookieAccepted, isRegister, password, requiredLoggingAccepted, studentId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = isRegister ? registerFormSchema.safeParse(buildInput()) : loginFormSchema.safeParse(buildInput());
    if (!parsed.success || pending) {
      setMessage(isRegister ? "회원가입을 완료할 수 없습니다. 입력값을 확인해주세요." : "학번 또는 비밀번호를 확인해주세요.");
      return;
    }

    setPending(true);
    let credentialsAccepted = false;
    try {
      const response = isRegister
        ? await registerParticipant({
            studentId: parsed.data.studentId,
            password: parsed.data.password,
            consent: {
              consentVersion,
              requiredLoggingAccepted: true,
              analyticsLoggingAccepted,
              cookieAccepted: true,
            },
          })
        : await loginParticipant({
            studentId: parsed.data.studentId,
            password: parsed.data.password,
          });

      if (response.ok) {
        credentialsAccepted = true;
        setPassword("");
        // Registration and login both issue a cookie; verify it before leaving
        // this page so blocked cookies cannot produce a silent redirect loop.
        router.replace(await authenticatedDestination());
        router.refresh();
        return;
      }

      if (response.status === 429) {
        setMessage("잠시 후 다시 시도해주세요.");
        return;
      }

      if (response.status >= 500) {
        setMessage("인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      setMessage(isRegister ? "회원가입을 완료할 수 없습니다. 입력값을 확인해주세요." : "학번 또는 비밀번호를 확인해주세요.");
    } catch (error) {
      if (error instanceof SessionCookieUnavailableError) {
        setMessage(`${isRegister ? "회원가입은 완료되었습니다. " : ""}${error.message}`);
      } else if (credentialsAccepted) {
        setMessage(isRegister
          ? "회원가입은 완료되었지만 로그인 상태를 확인하지 못했습니다. 잠시 후 로그인해주세요."
          : "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
      } else {
        setMessage("요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setPending(false);
    }
  }

  function buildInput() {
    if (!isRegister) {
      return {
        studentId,
        password,
      };
    }

    return {
      studentId,
      password,
      consent: {
        consentVersion,
        requiredLoggingAccepted,
        analyticsLoggingAccepted,
        cookieAccepted,
      },
    };
  }

  return (
    <form className="panel formStack" onSubmit={submit} aria-busy={pending}>
      <label className="field">
        <span>학번</span>
        <input
          autoComplete="username"
          aria-describedby="student-id-help"
          disabled={pending}
          inputMode="numeric"
          maxLength={7}
          name="studentId"
          pattern="\d{7}"
          placeholder="7자리 학번"
          required
          value={studentId}
          onChange={(event) => setStudentId(event.target.value.replace(/\D/g, "").slice(0, 7))}
        />
        <small id="student-id-help">7자리 숫자 문자열로 입력합니다.</small>
      </label>

      <label className="field">
        <span>비밀번호</span>
        <input
          autoComplete={isRegister ? "new-password" : "current-password"}
          aria-describedby="password-help"
          disabled={pending}
          maxLength={256}
          minLength={8}
          name="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <small id="password-help">8자 이상 128자 이하로 입력합니다.</small>
      </label>

      {isRegister ? (
        <div className="consentBox" aria-label="필수 동의">
          <div className="consentSummary">
            <strong>수집 항목</strong>
            <span>학번 조회용 hash, 암호화된 학번, 로그인/제출/클리어 처리 기록, 보안 감사 이벤트</span>
            <strong>저장하지 않는 항목</strong>
            <span>비밀번호 원문, 제출 원문, 플래그 원문, session token 원문, clear token 원문</span>
            <strong>보존 기간</strong>
            <span>대회 운영과 이의 확인에 필요한 기간 동안 보관한 뒤 운영 정책에 따라 삭제합니다.</span>
          </div>

          <label className="checkRow">
            <input
              checked={requiredLoggingAccepted}
              disabled={pending}
              required
              type="checkbox"
              onChange={(event) => setRequiredLoggingAccepted(event.target.checked)}
            />
            <span>[필수] 서비스 이용과 보안 운영 로그 수집에 동의합니다.</span>
          </label>
          <p>
            로그인, 제출, 클리어 처리와 장애 대응에 필요한 최소 운영 로그만 사용하며 비밀번호, 제출 원문, 플래그 원문은
            저장하지 않습니다.
          </p>

          <label className="checkRow">
            <input
              checked={analyticsLoggingAccepted}
              disabled={pending}
              type="checkbox"
              onChange={(event) => setAnalyticsLoggingAccepted(event.target.checked)}
            />
            <span>[선택] CTF 진행 분석 로그 수집에 동의합니다.</span>
          </label>

          <label className="checkRow">
            <input checked={cookieAccepted} disabled={pending} required type="checkbox" onChange={(event) => setCookieAccepted(event.target.checked)} />
            <span>[필수] 로그인 유지에 필요한 쿠키 사용에 동의합니다.</span>
          </label>
        </div>
      ) : null}

      {message ? <p className="formError" role="alert">{message}</p> : null}

      <button className="primaryButton" disabled={!isValid || pending} type="submit">
        {pending ? "처리 중" : isRegister ? "회원가입" : "로그인"}
      </button>
    </form>
  );
}
