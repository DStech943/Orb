import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authBenefits } from "../../data/authContent";
import { useAuth } from "../../context/AuthContext";
import { rememberReturnPath, safeAppPath } from "../../lib/returnTo";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.98 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold text-ink">
      {label}
      <div className="relative mt-1.5">{children}</div>
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}) {
  return (
    <input
      required
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm font-normal text-ink placeholder:text-fg-muted/60 transition outline-none shadow-2xs focus:border-primary focus:ring-4 focus:ring-primary/10"
    />
  );
}

function PasswordInput({ value, onChange, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <Field label="Password">
      <TextInput
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder="Enter your password"
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-fg-muted transition hover:text-ink focus:outline-none"
        aria-label={shown ? "Hide password" : "Show password"}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </Field>
  );
}

export default function AuthPage({ mode = "login" }) {
  const { user, loading, login, signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [visibleTicks, setVisibleTicks] = useState(0);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const isSignup = mode === "signup";
  const title = useMemo(
    () => (isSignup ? "Create your account" : "Welcome back"),
    [isSignup],
  );
  const subtext = isSignup
    ? "Start giving your AI the verified context it deserves."
    : "Sign in to continue managing your brand's AI knowledge.";

  useEffect(() => {
    setVisibleTicks(0);
    const starter = window.setTimeout(() => setVisibleTicks(1), 300);
    const interval = window.setInterval(
      () =>
        setVisibleTicks((count) => {
          if (count >= authBenefits.length) {
            window.clearInterval(interval);
            return count;
          }
          return count + 1;
        }),
      400,
    );
    return () => {
      window.clearTimeout(starter);
      window.clearInterval(interval);
    };
  }, [mode]);

  // Signing in sets `user` before the submit handler below finishes, so this branch
  // must also honour the page the person came from, not only /app.
  if (user) return <Navigate to={safeAppPath(location.state?.from?.pathname) || "/app"} replace />;

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (isSignup && form.password !== form.confirmPassword)
      return setError("Your passwords do not match.");
    if (form.password.length < 6)
      return setError("Use at least 6 characters for your password.");
    setSubmitting(true);
    try {
      if (isSignup) await signup(form);
      else await login(form);
      navigate(safeAppPath(location.state?.from?.pathname) || "/app", { replace: true });
    } catch (authError) {
      const message =
        authError.message || "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const google = async () => {
    setError("");
    setSubmitting(true);
    try {
      rememberReturnPath(location.state?.from?.pathname);
      await loginWithGoogle();
    } catch (authError) {
      setError(authError.message || "Google sign-in could not start.");
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-8">
      {/* Subtle atmospheric ambient glow matching dashboard */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-orange/10 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line bg-white shadow-pop lg:grid-cols-[1.1fr_1fr]">
        {/* Left branded showcase panel */}
        <aside className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1C1844] via-[#2A2362] to-[#1C1844] p-8 text-white sm:p-12">
          {/* Internal soft glows */}
          <div className="pointer-events-none absolute -left-20 -top-16 h-64 w-64 rounded-full bg-primary/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-[#FF9B3D]/25 blur-3xl" />

          <div className="relative z-10">
            <Link
              to="/"
              className="orb-wordmark inline-flex items-center text-xl font-extrabold tracking-tight text-white transition hover:opacity-90"
              aria-label="Orb home"
            >
              Orb<span className="text-primary">.</span>
            </Link>

            <div className="mt-14 sm:mt-16">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-primary-tint backdrop-blur-xs">
                <Sparkles size={12} className="text-primary-tint" />
                Next-Gen Agent Ops
              </span>
              <h2 className="mt-4 font-display text-3xl font-normal leading-tight tracking-tight text-white sm:text-4xl">
                The clearest way to prepare your business for{" "}
                <em className="italic text-primary-tint">AI</em>.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
                Make your operational knowledge trustworthy, compact, and ready
                to guide every customer conversation across all channels.
              </p>
            </div>

            <ul className="mt-8 space-y-3.5">
              {authBenefits.map((benefit, index) => (
                <li
                  className={`flex items-start gap-3 text-sm font-medium text-white/90 transition-all duration-500 ${
                    index < visibleTicks
                      ? "translate-x-0 opacity-100"
                      : "-translate-x-2 opacity-0"
                  }`}
                  key={benefit}
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check size={12} strokeWidth={2.5} />
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 mt-12 border-t border-white/10 pt-6">
            <p className="text-xs text-white/50">
              Trusted by fast-growing direct-to-consumer and enterprise brands.
            </p>
          </div>
        </aside>

        {/* Right authentication form section */}
        <section className="flex min-h-[560px] items-center bg-white p-7 sm:p-12">
          <div className="mx-auto w-full max-w-md">
            <Link
              to="/"
              className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-fg-muted transition hover:text-ink"
            >
              <ArrowLeft size={14} /> Back to home
            </Link>

            <div className="animate-fade-in">
              {loading ? (
                <div className="grid min-h-72 place-items-center">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              ) : (
                <>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-tint text-primary shadow-xs">
                    <KeyRound size={20} />
                  </div>

                  <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                    {title}
                  </h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                    {subtext}
                  </p>

                  {error && (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl border border-danger/25 bg-danger-tint px-3.5 py-2.5 text-xs font-medium text-danger"
                    >
                      {error}
                    </p>
                  )}

                  <form className="mt-6 space-y-4" onSubmit={submit}>
                    {isSignup && (
                      <Field label="Full name">
                        <TextInput
                          value={form.name}
                          onChange={updateField("name")}
                          placeholder="Your name"
                          autoComplete="name"
                        />
                      </Field>
                    )}
                    <Field label="Email address">
                      <TextInput
                        type="email"
                        value={form.email}
                        onChange={updateField("email")}
                        placeholder="you@company.com"
                        autoComplete="email"
                      />
                    </Field>
                    <PasswordInput
                      value={form.password}
                      onChange={updateField("password")}
                      autoComplete={
                        isSignup ? "new-password" : "current-password"
                      }
                    />
                    {isSignup && (
                      <>
                        <Field label="Confirm password">
                          <TextInput
                            type="password"
                            value={form.confirmPassword}
                            onChange={updateField("confirmPassword")}
                            placeholder="Repeat your password"
                            autoComplete="new-password"
                          />
                        </Field>
                        <p className="text-xs text-fg-muted">
                          Use at least 6 characters to create your account.
                        </p>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-card transition duration-150 hover:bg-primary-dark active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting && (
                        <Loader2 className="animate-spin" size={16} />
                      )}
                      {submitting
                        ? "Please wait…"
                        : isSignup
                          ? "Create account"
                          : "Sign in"}
                    </button>
                  </form>

                  <div className="my-5 flex items-center gap-3 text-xs font-medium text-fg-muted">
                    <span className="h-px flex-1 bg-line" />
                    or continue with
                    <span className="h-px flex-1 bg-line" />
                  </div>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={google}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-2xs transition duration-150 hover:bg-subtle active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <GoogleIcon />
                    Google
                  </button>

                  <div className="mt-6 text-center text-xs font-normal text-fg-muted">
                    {isSignup ? (
                      <>
                        Already have an account?{" "}
                        <Link
                          className="font-semibold text-primary transition hover:underline underline-offset-2"
                          to="/login"
                        >
                          Sign in
                        </Link>
                      </>
                    ) : (
                      <>
                        New to Orb?{" "}
                        <Link
                          className="font-semibold text-primary transition hover:underline underline-offset-2"
                          to="/signup"
                        >
                          Create an account
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
