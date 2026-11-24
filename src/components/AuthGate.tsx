import { FormEvent, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, updateProfile, type User } from "firebase/auth";
import { ArrowRight, BookOpenCheck, Braces, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { auth, firebaseReady } from "../firebase";

interface AuthGateProps {
  checking: boolean;
  user: User | null;
  redirectError?: unknown;
  onSignOut: () => Promise<void>;
  onVerified: () => Promise<void>;
  onBackToLanding: () => void;
}

export default function AuthGate({ checking, user, redirectError, onSignOut, onVerified, onBackToLanding }: AuthGateProps) {
  const [creating, setCreating] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown === 0) return;
    const timer = window.setTimeout(() => setResendCountdown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  useEffect(() => {
    if (redirectError) setError(firebaseError(redirectError));
  }, [redirectError]);

  if (checking) return <div className="auth-loading"><LoaderCircle className="spin" size={25} /> Securing your workspace…</div>;
  if (!firebaseReady || !auth) return (
    <div className="auth-shell config-shell">
      <div className="auth-showcase config-showcase">
        <AuthBrand />
        <div className="showcase-content">
          <span className="showcase-pill"><Sparkles size={13} /> A PRIVATE LEARNING WORKSPACE</span>
          <h1>Your learning,<br />all in <span>one place.</span></h1>
          <p>Connect a Firebase project to unlock a secure space for your code, study materials, and team rooms.</p>
          <div className="showcase-modules">
            <div><span className="showcase-module-icon code"><LockKeyhole size={16} /></span><span><strong>Secure sign-in</strong><small>Authentication with verified accounts.</small></span><ArrowRight size={14} /></div>
            <div><span className="showcase-module-icon notes"><BookOpenCheck size={16} /></span><span><strong>Your learning history</strong><small>Cloud Firestore keeps progress in sync.</small></span><ArrowRight size={14} /></div>
            <div><span className="showcase-module-icon rooms"><ShieldCheck size={16} /></span><span><strong>Trusted admin tools</strong><small>Protected server-side moderation.</small></span><ArrowRight size={14} /></div>
          </div>
        </div>
        <div className="showcase-bottom"><ShieldCheck size={13} /> Your data stays protected by Firebase security rules.</div>
      </div>
      <div className="auth-main config-main">
        <div className="auth-mobile-brand"><AuthBrand /></div>
        <section className="auth-card config-card">
          <div className="config-status"><span><LockKeyhole size={13} /></span> SETUP REQUIRED</div>
          <button className="auth-back landing-back-link" onClick={onBackToLanding}>العودة إلى الصفحة الرئيسية</button>
          <div className="auth-icon config-icon"><LockKeyhole size={21} /></div>
          <h1>Connect your Firebase project</h1>
          <p>Authentication and cloud features are securely disabled until Firebase is configured. Follow these steps to get started.</p>
          <div className="config-steps"><span>1</span><div><strong>Add your web app configuration</strong><code>Copy .env.example to .env.local</code></div></div>
          <div className="config-steps"><span>2</span><div><strong>Enable the Firebase services</strong><code>Authentication and Cloud Firestore</code></div></div>
          <div className="config-steps"><span>3</span><div><strong>Restart the development server</strong><code>npm run dev</code></div></div>
          <p className="auth-security-note"><ShieldCheck size={14} /> Admin operations are protected by Firestore security rules.</p>
        </section>
        <AuthFooter />
      </div>
    </div>
  );
  if (user && !user.emailVerified) return (
    <div className="auth-shell auth-verify-shell">
      <AuthShowcase verification />
      <div className="auth-main auth-verify-main">
        <div className="auth-mobile-brand"><AuthBrand /></div>
        <section className="auth-card verify-card">
          <div className="verify-illustration"><span className="verify-orbit verify-orbit-one" /><span className="verify-orbit verify-orbit-two" /><span className="verify-mail-icon"><Mail size={28} /></span><i className="verify-sparkle">✦</i></div>
          <p className="auth-eyebrow">ONE QUICK SECURITY STEP</p>
          <h1>Check your inbox</h1>
          <p className="verify-copy">We sent a secure verification link to</p>
          <div className="verify-address"><span><Mail size={16} /></span><strong>{user.email}</strong></div>
          <p className="verify-copy verify-instruction">Open the email and confirm your address to unlock your workspace. If you don't see it, check your spam folder.</p>
          {message && <div className="auth-success" role="status"><CheckCircle2 size={16} />{message}</div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-primary" onClick={async () => {
            setBusy(true); setError(""); setMessage("");
            try {
              await sendEmailVerification(user);
              setMessage("A fresh verification link is on its way. Check your inbox.");
              setResendCountdown(60);
            } catch (caught) {
              setError(firebaseError(caught));
            } finally {
              setBusy(false);
            }
          }} disabled={busy || resendCountdown > 0}>{busy ? <LoaderCircle className="spin" size={17} /> : <Mail size={16} />} {resendCountdown ? `Resend link in ${resendCountdown}s` : "Send a new verification link"}</button>
          <button className="auth-secondary" disabled={busy} onClick={() => void onVerified()}>{busy ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />} I've verified my email</button>
          <p className="verify-resend-hint">{resendCountdown ? `You can request another link in ${resendCountdown}s` : "Didn't receive it? You can send another link."}</p>
          <button className="auth-back" onClick={() => void onSignOut()}>Sign out and use another account</button>
          <div className="verify-privacy"><ShieldCheck size={14} /><span>Your account stays protected until your email is verified.</span></div>
        </section>
        <AuthFooter />
      </div>
    </div>
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      if (creating) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
        await sendEmailVerification(credential.user);
        setMessage("Account created. Verify your email using the link we just sent.");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (caught) {
      setError(firebaseError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    if (!auth) return;
    setError(""); setMessage(""); setBusy(true);
    sessionStorage.removeItem("omnilearn-google-redirect-pending");
    sessionStorage.setItem("omnilearn-google-redirect-pending", "true");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
        await signInWithPopup(auth, provider);
        return;
      }
      sessionStorage.setItem("omnilearn-google-redirect-pending", "true");
      await signInWithRedirect(auth, provider);
    } catch (caught) {
      sessionStorage.removeItem("omnilearn-google-redirect-pending");
      setError(firebaseError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    if (!email.trim()) {
      setError("Enter your email address and we'll send you a password reset link.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("If an account exists for this address, a password reset link is on its way.");
    } catch (caught) {
      setError(firebaseError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <AuthShowcase />
      <div className="auth-main auth-login-main">
        <div className="auth-mobile-brand"><AuthBrand /></div>
        <section className={`auth-card auth-entry-card ${creating ? "creating-account" : ""}`}>
          <div className="auth-heading-mark"><Sparkles size={16} /></div>
          <button className="auth-back landing-back-link" onClick={onBackToLanding}>العودة إلى الصفحة الرئيسية</button>
          <p className="auth-eyebrow">{resetMode ? "ACCOUNT RECOVERY" : creating ? "A GOOD PLACE TO BEGIN" : "WELCOME BACK"}</p>
          <h2>{resetMode ? "Reset your password" : creating ? "Create your account" : "Sign in to OmniLearn"}</h2>
          <p className="auth-subtitle">{resetMode ? "We'll email you a secure link to choose a new password." : creating ? "A focused space for your next great idea." : "Your learning space is ready when you are."}</p>
          {!resetMode && <>
            <button className="google-button" disabled={busy} onClick={() => void googleSignIn()}><GoogleMark /> Continue with Google</button>
            <div className="auth-separator"><span>or continue with email</span></div>
          </>}
          <form onSubmit={(event) => void (resetMode ? resetPassword(event) : handleSubmit(event))}>
            {creating && !resetMode && <label className="auth-field"><span>Your name</span><div><Sparkles size={16} /><input required minLength={2} maxLength={80} autoComplete="name" placeholder="Alex Rivera" value={name} onChange={(event) => setName(event.target.value)} /></div></label>}
            <label className="auth-field"><span>Email address</span><div><Mail size={16} /><input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div></label>
            {!resetMode && <label className="auth-field"><span>Password</span><div><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} required minLength={6} autoComplete={creating ? "new-password" : "current-password"} placeholder={creating ? "At least 6 characters" : "Enter your password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
            {!creating && !resetMode && <button className="forgot-password" type="button" onClick={() => { setResetMode(true); setError(""); setMessage(""); }}>Forgot password?</button>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            {message && <div className="auth-success" role="status"><CheckCircle2 size={16} />{message}</div>}
            <button className="auth-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>{resetMode ? "Send reset link" : creating ? "Create account" : "Sign in securely"} <ArrowRight size={16} /></>}</button>
          </form>
          <p className="auth-switch">{resetMode ? "Remembered your password?" : creating ? "Already have an account?" : "New to OmniLearn?"} <button onClick={() => { if (resetMode) { setCreating(false); setResetMode(false); } else setCreating(!creating); setError(""); setMessage(""); }}>{resetMode ? "Back to sign in" : creating ? "Sign in" : "Create an account"}</button></p>
          {!resetMode && <div className="auth-privacy"><ShieldCheck size={14} /><span>Your account and learning activity are protected.</span></div>}
        </section>
        <AuthFooter />
      </div>
    </div>
  );
}

function AuthBrand() { return <div className="auth-brand"><span><Sparkles size={19} /></span><strong>omni<span>learn</span><i>AI</i></strong></div>; }
function AuthFooter() { return <footer className="auth-footer"><span>© 2026 OmniLearn AI</span><span><ShieldCheck size={12} /> Secure sign-in by Firebase</span></footer>; }
function AuthShowcase({ verification = false }: { verification?: boolean }) {
  return <div className="auth-showcase">
    <AuthBrand />
    <div className="showcase-content">
      <span className="showcase-pill"><Sparkles size={13} /> {verification ? "ONE ACCOUNT, ALL YOUR WORK" : "YOUR IDEAS, IN GOOD COMPANY"}</span>
      <h1>{verification ? <>Almost there.<br /><span>Your space awaits.</span></> : <>Make room for<br />your <span>next big idea.</span></>}</h1>
      <p>{verification ? "Confirm your email to keep your account secure and continue into your learning workspace." : "One thoughtful workspace for understanding code, discovering ideas, and learning together."}</p>
      <div className="showcase-modules">
        <div><span className="showcase-module-icon code"><Braces size={17} /></span><span><strong>CodeLingo</strong><small>Make code make sense.</small></span><ArrowRight size={14} /></div>
        <div><span className="showcase-module-icon notes"><BookOpenCheck size={16} /></span><span><strong>EduNotes AI</strong><small>Turn notes into know-how.</small></span><ArrowRight size={14} /></div>
        <div><span className="showcase-module-icon rooms"><UsersRound size={16} /></span><span><strong>Study together</strong><small>Better, side by side.</small></span><ArrowRight size={14} /></div>
      </div>
    </div>
    <div className="showcase-decoration"><div className="showcase-orbit" /><div className="showcase-orbit second" /><div className="showcase-sphere"><Sparkles size={27} /></div><span>Ideas become understanding.</span></div>
    <div className="showcase-bottom"><ShieldCheck size={13} /> Private by design. Your learning belongs to you.</div>
  </div>;
}
function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.05 5.05 0 0 1-2.2 3.31v2.77h3.57c2.09-1.92 3.27-4.74 3.27-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.99 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.06H2.15A11 11 0 0 0 1 12c0 1.78.43 3.46 1.15 4.94l3.69-2.84z"/><path fill="#EA4335" d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.85 6.06l3.69 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>; }

function firebaseError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "An account already uses this email. Sign in instead.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password with at least 6 characters.",
    "auth/redirect-cancelled-by-user": "Google sign-in was cancelled before finishing.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in popup. Allow popups for this site and try again.",
    "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
    "auth/unauthorized-domain": "This domain is not authorized for Firebase sign-in. Add it in Firebase Authentication settings.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/operation-not-allowed": "Enable this sign-in method in Firebase Authentication settings.",
  };
  return messages[code] ?? (error instanceof Error ? error.message : "Sign-in failed. Please try again.");
}
