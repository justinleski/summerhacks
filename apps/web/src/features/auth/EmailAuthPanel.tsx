import { type FormEvent, useState } from "react";
import {
  getNeonSession,
  isNeonUserAlreadyExists,
  neonResendVerificationOtp,
  neonSignInEmail,
  neonSignUpEmail,
  neonVerifyEmailOtp,
} from "../../lib/neonAuth";

export type EmailAuthResult = {
  /** True after sign-up / verify; false after sign-in. */
  needsName: boolean;
};

type EmailAuthPanelProps = {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onAuthenticated: (result: EmailAuthResult) => Promise<void>;
  onError: (message: string | null) => void;
};

type Mode = "sign-in" | "sign-up" | "verify";

export function EmailAuthPanel({
  busy,
  setBusy,
  onAuthenticated,
  onError,
}: EmailAuthPanelProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    onError(null);
    setInfo(null);
    setOtp("");
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setInfo(null);
    setBusy(true);
    try {
      await neonSignInEmail({
        email: email.trim(),
        password,
      });
      await onAuthenticated({ needsName: false });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function finishAfterCredentials(opts: { needsName: boolean }) {
    const session = await getNeonSession();
    if (session) {
      await onAuthenticated(opts);
      return true;
    }
    return false;
  }

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setInfo(null);
    if (password !== confirm) {
      onError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      onError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    const trimmedEmail = email.trim();
    try {
      const name = trimmedEmail.split("@")[0] || "User";
      let needsVerification = true;
      try {
        const signedUp = await neonSignUpEmail({
          email: trimmedEmail,
          password,
          name,
        });
        needsVerification = signedUp.needsVerification;
      } catch (err) {
        // Account was created on a prior attempt (or double-submit). Sign in
        // instead of showing "User already exists" — that message only comes
        // from /sign-up/email, never from a real sign-in.
        if (!isNeonUserAlreadyExists(err)) throw err;
        await neonSignInEmail({ email: trimmedEmail, password });
        if (await finishAfterCredentials({ needsName: false })) return;
        setInfo(
          "Account found — enter the verification code from your email if prompted.",
        );
        setMode("verify");
        return;
      }
      if (await finishAfterCredentials({ needsName: true })) return;
      if (needsVerification) {
        setInfo(
          "Check your email for a verification code (expires in ~15 minutes).",
        );
      } else {
        // Verify-at-sign-up may be on even if the flag was omitted — prefer OTP step.
        setInfo(
          "If you received a code, enter it below. Otherwise try signing in.",
        );
      }
      setMode("verify");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      await neonVerifyEmailOtp({
        email: email.trim(),
        otp: otp.trim(),
      });
      await onAuthenticated({ needsName: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    onError(null);
    setBusy(true);
    try {
      await neonResendVerificationOtp(email.trim());
      setInfo("New code sent — check your inbox.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "verify") {
    return (
      <form className="bootstrap-form email-auth" onSubmit={onVerify}>
        <p className="muted">
          Enter the code emailed to <strong>{email}</strong>.
        </p>
        <label>
          Verification code
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          Verify email
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void onResend()}
        >
          Resend code
        </button>
        <button
          type="button"
          className="ghost linkish"
          disabled={busy}
          onClick={() => switchMode("sign-in")}
        >
          Back to sign in
        </button>
        {info && <p className="muted">{info}</p>}
      </form>
    );
  }

  return (
    <form
      className="bootstrap-form email-auth"
      onSubmit={mode === "sign-up" ? onSignUp : onSignIn}
    >
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoComplete={
            mode === "sign-up" ? "new-password" : "current-password"
          }
          required
          minLength={8}
        />
      </label>
      {mode === "sign-up" && (
        <label>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
      )}
      <button type="submit" className="primary" disabled={busy}>
        {mode === "sign-up" ? "Create account" : "Sign in with email"}
      </button>
      <button
        type="button"
        className="ghost linkish"
        disabled={busy}
        onClick={() =>
          switchMode(mode === "sign-up" ? "sign-in" : "sign-up")
        }
      >
        {mode === "sign-up"
          ? "Already have an account? Sign in"
          : "Need an account? Sign up"}
      </button>
      {info && <p className="muted">{info}</p>}
    </form>
  );
}
