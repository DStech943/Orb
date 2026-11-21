import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, FileText, HelpCircle, Loader2, Mic, Package } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import Orb from "../Orb";
import { authBenefits } from "../../data/authContent";
import { useAuth } from "../../context/AuthContext";
import { rememberReturnPath, safeAppPath } from "../../lib/returnTo";
import { arrivedViaTransition } from "../../lib/viewTransition";
import TransitionLink from "../ui/TransitionLink";
import { ease, RevealLines } from "../landing/primitives";

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.98 0 12s.45 3.83 1.25 5.42l4.03-3.15z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
    </svg>
  );
}

/** Input with a label that floats up out of the way on focus or once filled. */
function FloatingInput({ id, label, type = "text", value, onChange, autoComplete, trailing }) {
  return (
    <div className="group relative">
      <input
        id={id}
        required
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder=" "
        className={`peer h-14 w-full rounded-2xl border border-ink/10 bg-white/80 px-4 pb-2 pt-6 text-[15px] text-ink shadow-[0_1px_2px_rgba(24,24,60,0.04)] outline-none backdrop-blur transition-[border-color,box-shadow,background-color] duration-300 hover:border-ink/20 focus:border-primary focus:bg-white focus:shadow-[0_0_0_4px_rgba(99,91,255,0.12)] ${trailing ? "pr-12" : ""}`}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-fg-muted transition-all duration-200 peer-focus:top-[18px] peer-focus:text-[11px] peer-focus:font-medium peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-[18px] peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-medium"
      >
        {label}
      </label>
      {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}

function passwordScore(password) {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}
const strengthLabels = ["Too short", "Weak", "Okay", "Strong", "Excellent"];
const strengthColors = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

function StrengthMeter({ password }) {
  const score = passwordScore(password);
  return (
    <div className="flex items-center gap-3 px-1" aria-live="polite">
      <div className="flex flex-1 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
            <motion.span className={`block h-full rounded-full ${strengthColors[score]}`} initial={false} animate={{ scaleX: i < score ? 1 : 0 }} style={{ originX: 0 }} transition={{ duration: 0.4, ease }} />
          </span>
        ))}
      </div>
      <span className="w-16 text-right text-[11px] font-medium text-fg-muted">{password ? strengthLabels[score] : "6+ chars"}</span>
    </div>
  );
}

const chips = [
  { label: "FAQs", icon: HelpCircle, className: "left-[8%] top-[22%]", delay: 0.9, depth: 14, at: [19, 26] },
  { label: "SOPs", icon: FileText, className: "right-[6%] top-[30%]", delay: 1.05, depth: 22, at: [82, 34] },
  { label: "Products", icon: Package, className: "left-[12%] bottom-[30%]", delay: 1.2, depth: 30, at: [24, 70] },
  { label: "Brand voice", icon: Mic, className: "right-[10%] bottom-[24%]", delay: 1.35, depth: 18, at: [76, 76] },
];

/** A chip that drifts with the pointer by its own depth, so the panel feels layered. */
function ParallaxChip({ chip, index, px, py, reduce }) {
  const { label, icon: Icon, className, delay, depth } = chip;
  const x = useTransform(px, (v) => v * depth);
  const y = useTransform(py, (v) => v * depth);
  return (
    <motion.span style={reduce ? undefined : { x, y }} className={`absolute ${className}`}>
      <motion.span
        className="block"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.9 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: [0, -8, 0], scale: 1 }}
        transition={reduce ? undefined : { opacity: { delay, duration: 0.6 }, scale: { delay, duration: 0.6 }, y: { delay: delay + 0.6, duration: 4 + index * 0.6, repeat: Infinity, ease: "easeInOut" } }}
      >
        <span className="auth-chip inline-flex items-center gap-2 rounded-full border border-white/15 py-1.5 pl-1.5 pr-3.5 text-xs font-semibold text-white/90 backdrop-blur-md">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-white/25 to-white/5"><Icon size={12} /></span>
          {label}
          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_2px_rgba(110,231,183,0.55)]" />
        </span>
      </motion.span>
    </motion.span>
  );
}

/** The dark panel beside the form: a live orb, floating knowledge chips and rotating benefits. */
function Showcase() {
  const reduce = useReducedMotion();
  const [arrived] = useState(arrivedViaTransition);
  const [benefit, setBenefit] = useState(0);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const px = useSpring(pointerX, { stiffness: 70, damping: 18, mass: 0.6 });
  const py = useSpring(pointerY, { stiffness: 70, damping: 18, mass: 0.6 });
  const orbX = useTransform(px, (v) => v * -10);
  const orbY = useTransform(py, (v) => v * -10);
  const onPointerMove = (event) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
    pointerY.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
  };
  const onPointerLeave = () => { pointerX.set(0); pointerY.set(0); };
  useEffect(() => {
    if (reduce) return undefined;
    const id = window.setInterval(() => setBenefit((b) => (b + 1) % authBenefits.length), 3400);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    // Fixed to the viewport height and sticky, so a taller sign-up form never stretches it.
    <aside onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="relative hidden overflow-hidden rounded-[32px] bg-[#0D0B26] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_40px_80px_-30px_rgba(40,30,120,0.55)] ring-1 ring-white/10 lg:sticky lg:top-3 lg:flex lg:h-[calc(100svh-1.5rem)] lg:flex-col lg:self-start">
      <div aria-hidden="true" className="lp-gridlines lp-gridlines--night pointer-events-none absolute inset-0" />
      {/* Aurora: large soft colour fields that drift slowly (transform only, so it stays cheap). */}
      <div aria-hidden="true" className="auth-blob auth-blob--a -left-28 -top-28 h-[28rem] w-[28rem] bg-primary/45 blur-[120px]" />
      <div aria-hidden="true" className="auth-blob auth-blob--b -bottom-32 -right-24 h-[26rem] w-[26rem] bg-orange/28 blur-[120px]" />
      <div aria-hidden="true" className="auth-blob auth-blob--b left-[30%] top-[38%] h-72 w-72 bg-sky-400/20 blur-[110px]" />
      <div aria-hidden="true" className="auth-blob auth-blob--a right-[8%] top-[6%] h-56 w-56 bg-fuchsia-500/20 blur-[100px]" />
      <div aria-hidden="true" className="auth-stars" />
      <div aria-hidden="true" className="auth-stars--b" />

      <div className="relative z-10 flex items-center justify-between p-8">
        <TransitionLink to="/" className="orb-wordmark text-2xl font-extrabold tracking-tight text-white">Orb<span className="text-[#A9A3FF]">.</span></TransitionLink>
        <TransitionLink to="/" className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/75 backdrop-blur transition-colors hover:text-white">
          <ArrowLeft size={13} className="transition-transform duration-300 group-hover:-translate-x-0.5" aria-hidden="true" /> Back to site
        </TransitionLink>
      </div>

      <div className="relative flex-1" aria-hidden="true">
        {/* Knowledge flowing into the orb. */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {chips.map((chip) => <line key={chip.label} className="auth-link" x1={chip.at[0]} y1={chip.at[1]} x2="50" y2="50" />)}
        </svg>
        {/* Centring lives on the wrapper: the entrance `scale` would overwrite a translate on the same element. */}
        <div className="absolute left-1/2 top-1/2 aspect-square w-[min(78%,460px)] -translate-x-1/2 -translate-y-1/2">
          <motion.div style={reduce ? undefined : { x: orbX, y: orbY }} className="relative h-full w-full">
            <motion.div initial={reduce || arrived ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease, delay: 0.2 }} className="relative h-full w-full">
              <div className="lp-ring inset-[-8%] !border-white/10" />
              <div className="lp-ring inset-[-22%] !border-white/[0.05]" />
              <div data-vt-orb className="absolute inset-0 [mask-image:radial-gradient(circle_closest-side,#000_93%,transparent_100%)] [-webkit-mask-image:radial-gradient(circle_closest-side,#000_93%,transparent_100%)]">
                <Orb colors={["#9c43fe", "#4cc2e9", "#101499"]} backgroundColor="#0D0B26" size={0.95} glow={1.2} hoverIntensity={0.9} rotateOnHover followCursor intro={!arrived} dpr={1.5} />
              </div>
              <div className="auth-halo pointer-events-none absolute inset-[-18%] rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.30)_0%,rgba(76,194,233,0.10)_38%,transparent_66%)] blur-2xl" />
              {/* The ring is hollow; this fills its centre with a faint nebula. */}
              <div className="pointer-events-none absolute inset-[24%] rounded-full bg-[radial-gradient(circle_at_40%_35%,rgba(150,120,255,0.30),rgba(76,194,233,0.08)_55%,transparent_72%)] mix-blend-screen" />
              <div className="auth-sweep pointer-events-none absolute inset-[6%] rounded-full opacity-60 [background:conic-gradient(from_0deg,transparent_0deg,transparent_250deg,rgba(190,170,255,0.35)_330deg,transparent_360deg)] [mask-image:radial-gradient(circle,transparent_62%,#000_64%,#000_68%,transparent_70%)] [-webkit-mask-image:radial-gradient(circle,transparent_62%,#000_64%,#000_68%,transparent_70%)]" />
            </motion.div>
          </motion.div>
        </div>
        {chips.map((chip, i) => <ParallaxChip key={chip.label} chip={chip} index={i} px={px} py={py} reduce={reduce} />)}
      </div>

      <div className="relative z-10 p-8 pt-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">With Orb you can</p>
        <div className="relative mt-3 h-[4.5rem]">
          <AnimatePresence mode="wait">
            <motion.p key={benefit} initial={{ opacity: 0, y: 18, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.6, ease }} className="absolute inset-0 font-display text-[1.7rem] font-[380] leading-tight tracking-[-0.01em]">
              {authBenefits[benefit]}.
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="mt-5 flex gap-1.5">
          {authBenefits.map((item, i) => (
            <button key={item} type="button" onClick={() => setBenefit(i)} aria-label={`Show benefit ${i + 1}`} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <span className={`block h-full rounded-full bg-white transition-all duration-500 ${i === benefit ? "w-full" : i < benefit ? "w-full opacity-40" : "w-0"}`} />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** Eases its height to whatever its content measures, so swapping panels never jumps.
    The padding / negative-margin pair leaves room for focus rings and shadows inside the clip. */
function AutoHeight({ children, className = "" }) {
  const ref = useRef(null);
  const [height, setHeight] = useState("auto");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.div className={`-mx-4 -mb-10 overflow-hidden ${className}`} initial={false} animate={{ height }} transition={{ duration: 0.55, ease }}>
      <div ref={ref} className="relative px-4 pb-10">{children}</div>
    </motion.div>
  );
}

const panelVariants = {
  enter: (dir) => ({ x: dir * 56, opacity: 0, filter: "blur(4px)" }),
  center: { x: 0, opacity: 1, filter: "blur(0px)", transition: { duration: 0.55, ease } },
  exit: (dir) => ({ x: dir * -56, opacity: 0, filter: "blur(4px)", transition: { duration: 0.35, ease } }),
};

export default function AuthPage() {
  const { user, loading, login, signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname === "/signup";
  const mode = isSignup ? "signup" : "login";
  // Create account sits to the right of Sign in, so it slides in from the right.
  const direction = isSignup ? 1 : -1;
  // The word-by-word headline reveal is for first load only; on a switch the panel moves as one.
  const initialMode = useRef(mode);
  const switchedRef = useRef(false);
  if (mode !== initialMode.current) switchedRef.current = true;
  const switched = switchedRef.current;
  const [submitting, setSubmitting] = useState(false);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });

  // A message from the other mode would be confusing after switching tabs.
  useEffect(() => setError(""), [isSignup]);

  // Signing in sets `user` before the submit handler below finishes, so this branch
  // must also honour the page the person came from, not only /app.
  if (user) return <Navigate to={safeAppPath(location.state?.from?.pathname) || "/app"} replace />;

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (isSignup && form.password !== form.confirmPassword) return setError("Your passwords do not match.");
    if (form.password.length < 6) return setError("Use at least 6 characters for your password.");
    setSubmitting(true);
    try {
      if (isSignup) await signup(form);
      else await login(form);
      navigate(safeAppPath(location.state?.from?.pathname) || "/app", { replace: true });
    } catch (authError) {
      setError(authError.message || "Something went wrong. Please try again.");
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

  // Keep the place the person was heading to when they switch between the two tabs.
  const tabState = location.state;

  return (
    <div data-vt-page="auth" className="lp min-h-[100svh]">
      <div aria-hidden="true" className="lp-grain" />
      <main className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[1.05fr_1fr]">
        <Showcase />

        <section className="relative flex flex-col px-3 py-6 sm:px-8 lg:py-5">
          <div aria-hidden="true" className="lp-gridlines pointer-events-none absolute inset-0 lg:hidden" />
          {/* Clipped, so the glows can never make the page taller than the window. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="auth-blob auth-blob--a -right-24 top-[8%] h-80 w-80 bg-primary/15 blur-[110px]" />
            <div className="auth-blob auth-blob--b -bottom-20 left-[6%] h-72 w-72 bg-orange/20 blur-[110px]" />
          </div>
          <div className="relative flex items-center justify-between lg:justify-end">
            <Link to="/" className="orb-wordmark text-2xl font-extrabold tracking-tight text-ink lg:hidden">Orb<span className="text-primary">.</span></Link>
            <motion.p key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }} className="text-sm text-fg-muted">
              {isSignup ? "Already with us?" : "New to Orb?"}{" "}
              <Link to={isSignup ? "/login" : "/signup"} state={tabState} className="font-semibold text-ink underline decoration-ink/20 underline-offset-4 transition-colors hover:decoration-primary">
                {isSignup ? "Sign in" : "Create an account"}
              </Link>
            </motion.p>
          </div>

          <div className="relative mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-start py-6 lg:pt-[2vh]">
            {loading ? (
              <div className="grid min-h-72 place-items-center"><Loader2 className="animate-spin text-primary" size={30} /></div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }} className="auth-card p-5 sm:p-7 lg:p-6">
                <div className="relative grid grid-cols-2 rounded-full border border-white/80 bg-white/60 p-1 shadow-card backdrop-blur" role="tablist" aria-label="Account">
                  {[{ to: "/login", label: "Sign in", active: !isSignup }, { to: "/signup", label: "Create account", active: isSignup }].map((tab) => (
                    <Link key={tab.to} to={tab.to} state={tabState} replace role="tab" aria-selected={tab.active} className={`relative z-10 flex h-10 items-center justify-center rounded-full text-sm font-medium transition-colors duration-300 ${tab.active ? "text-white" : "text-ink/60 hover:text-ink"}`}>
                      {tab.active && <motion.span layoutId="auth-tab" className="absolute inset-0 -z-10 rounded-full bg-ink shadow-[0_8px_20px_-8px_rgba(37,38,58,0.6)]" transition={{ type: "spring", stiffness: 380, damping: 36 }} />}
                      {tab.label}
                    </Link>
                  ))}
                </div>

                {/* One motion for the whole switch: the panel slides as a unit toward the tab that
                    was picked, while the container eases to the new panel's height. */}
                <AutoHeight className="mt-8 lg:mt-6">
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.div key={mode} custom={direction} variants={panelVariants} initial="enter" animate="center" exit="exit" className="w-full">
                      <h1 className="auth-title font-display text-[2.6rem] font-[380] leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl lg:text-[2.6rem]">
                        {switched ? (
                          isSignup ? <>Create your<br /><em className="text-primary">workspace.</em></> : <>Welcome<br /><em className="text-primary">back.</em></>
                        ) : (
                          <RevealLines stagger={0.05} lines={isSignup ? [["Create", "your"], [{ em: "workspace." }]] : [["Welcome"], [{ em: "back." }]]} />
                        )}
                      </h1>
                      <p className="mt-3 text-[15px] leading-6 text-fg-muted">
                        {isSignup ? "Give your AI agent the verified context it deserves." : "Sign in to keep shaping your brand’s AI knowledge."}
                      </p>

                      <button type="button" disabled={submitting} onClick={google} className="mt-8 flex h-12 w-full items-center justify-center gap-3 lg:mt-5 rounded-2xl border border-ink/10 bg-white text-sm font-semibold text-ink shadow-card transition-[box-shadow,border-color] duration-300 hover:border-ink/20 hover:shadow-[0_14px_30px_-16px_rgba(60,40,140,0.4)] disabled:pointer-events-none disabled:opacity-60">
                        <GoogleIcon /> Continue with Google
                      </button>

                      <div className="my-6 flex items-center gap-3 text-xs text-fg-muted lg:my-4">
                        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-ink/15" />
                        or with email
                        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-ink/15" />
                      </div>

                      <AnimatePresence>
                        {error && (
                          <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto", x: [0, -8, 8, -5, 5, 0] }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45 }} className="overflow-hidden">
                            <p className="mb-4 rounded-2xl border border-danger/20 bg-danger-tint px-4 py-3 text-sm text-danger">{error}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <form onSubmit={submit} className="grid gap-3">
                        {isSignup && <FloatingInput id={`${mode}-name`} label="Full name" value={form.name} onChange={updateField("name")} autoComplete="name" />}
                        <FloatingInput id={`${mode}-email`} label="Work email" type="email" value={form.email} onChange={updateField("email")} autoComplete="email" />
                        <FloatingInput
                          id={`${mode}-password`}
                          label="Password"
                          type={shown ? "text" : "password"}
                          value={form.password}
                          onChange={updateField("password")}
                          autoComplete={isSignup ? "new-password" : "current-password"}
                          trailing={
                            <button type="button" onClick={() => setShown((v) => !v)} className="grid h-10 w-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-ink/5 hover:text-ink" aria-label={shown ? "Hide password" : "Show password"}>
                              {shown ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                          }
                        />
                        {isSignup && (
                          <>
                            <StrengthMeter password={form.password} />
                            <FloatingInput id={`${mode}-confirm`} label="Confirm password" type={shown ? "text" : "password"} value={form.confirmPassword} onChange={updateField("confirmPassword")} autoComplete="new-password"
                              trailing={form.confirmPassword && form.confirmPassword === form.password ? <span className="mr-2 grid h-6 w-6 place-items-center rounded-full bg-success text-white"><Check size={12} strokeWidth={3} /></span> : null}
                            />
                          </>
                        )}
                        <button type="submit" disabled={submitting} aria-busy={submitting || undefined} className="auth-btn lp-btn-shine group mt-3 flex h-14 w-full lg:h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-[0_18px_40px_-14px_rgba(99,91,255,0.95),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,transform] duration-300 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70">
                          {submitting ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : null}
                          {submitting ? "Just a moment…" : isSignup ? "Create account" : "Sign in"}
                          {!submitting && <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />}
                        </button>
                      </form>
                    </motion.div>
                  </AnimatePresence>
                </AutoHeight>
              </motion.div>
            )}
          </div>

          <p className="relative text-center text-xs text-fg-muted lg:text-left">© {new Date().getFullYear()} Orb. All rights reserved.</p>
        </section>
      </main>
    </div>
  );
}
