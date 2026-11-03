import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  KeyRound,
  CheckCircle2,
  LogOut,
  Coins,
  Trophy,
  History,
  Copy,
  Check,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { SeatId } from '../game/types';
import { apiFetch } from '../utils/apiClient';
import {
  dispatchFirebaseVerificationEmail,
  checkFirebaseEmailVerificationStatus,
  verifyEmailOwnershipWithGooglePopup,
  dispatchFirebasePasswordResetEmail,
  syncVerifiedProfileToFirestore,
  signInWithFirebaseEmail,
} from '../lib/firebase';

export interface UserProfile {
  id: number;
  uid: string;
  playerId?: string;
  email: string;
  displayName: string;
  authProvider: string;
  emailVerified?: boolean;
  preferredSeat: SeatId;
  coins: number;
  highestBalance: number;
  totalWins: number;
  totalRounds: number;
  hasPasswordHash: boolean;
}

export interface GameSessionRecord {
  id: number;
  roomCode: string | null;
  dealerSeat: string;
  cutterSeat: string;
  winningSide: string;
  pointCard: string;
  wager: number;
  coinDelta: number;
  finalBalance: number;
  createdAt: string;
}

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  token: string | null;
  onAuthSuccess: (token: string, user: UserProfile) => void;
  onLogout: () => void;
  onSelectSeat: (seat: SeatId) => void;
}

type MainTab = 'login' | 'register';
type ActiveScreen = 'login' | 'register' | 'verify' | 'forgot';

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  token,
  onAuthSuccess,
  onLogout,
  onSelectSeat,
}) => {
  const [mainTab, setMainTab] = useState<MainTab>('login');
  const [screen, setScreen] = useState<ActiveScreen>('login');

  // Form fields
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredSeat, setPreferredSeat] = useState<SeatId>('D');

  // Auto-generated Player ID suffix for Register preview
  const [randomSuffix] = useState(() => Math.floor(100 + Math.random() * 900));
  const previewPlayerId = useMemo(() => {
    const clean = (username || email.split('@')[0] || 'player')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 12);
    return `${clean || 'player'}_${randomSuffix}`;
  }, [username, email, randomSuffix]);

  // Verification step state (never displays or pre-fills codes on screen)
  const [assignedPlayerId, setAssignedPlayerId] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [smtpEmailSent, setSmtpEmailSent] = useState(false);
  const [firebaseEmailSent, setFirebaseEmailSent] = useState(false);
  const [firebaseProviderDisabled, setFirebaseProviderDisabled] = useState(false);
  const [copiedProfileId, setCopiedProfileId] = useState(false);

  // Forgot password state
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [firebaseResetSent, setFirebaseResetSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sessions, setSessions] = useState<GameSessionRecord[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);

    if (token) {
      apiFetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.sessions) setSessions(data.sessions);
        })
        .catch(() => {});
    }
  }, [isOpen, token]);

  // Auto-detect when the user clicks the verification link in their email inbox
  useEffect(() => {
    if (!isOpen || screen !== 'verify' || !firebaseEmailSent || loading) return;
    let cancelled = false;

    const checkSilently = async () => {
      const lookup = pendingEmail || email.trim() || identifier.trim();
      if (!lookup) return;
      const status = await checkFirebaseEmailVerificationStatus(lookup, password);
      if (cancelled || !status.verified || !status.idToken) return;

      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          firebaseIdToken: status.idToken,
          verificationToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!cancelled && res.ok && data?.token && data?.user) {
        await completeVerifiedSignIn(data.token, data.user);
      }
    };

    const interval = window.setInterval(checkSilently, 3500);
    const onFocus = () => {
      void checkSilently();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isOpen, screen, firebaseEmailSent, pendingEmail, email, identifier, password, verificationToken, loading]);

  if (!isOpen) return null;

  const switchMainTab = (next: MainTab) => {
    setMainTab(next);
    setScreen(next);
    setError(null);
    setSuccessMsg(null);
  };

  const completeVerifiedSignIn = async (authToken: string, profile: UserProfile) => {
    await syncVerifiedProfileToFirestore({
      playerId: profile.playerId || profile.uid,
      displayName: profile.displayName,
      email: profile.email,
      preferredSeat: profile.preferredSeat || 'D',
      coins: profile.coins,
      highestBalance: profile.highestBalance,
      totalWins: profile.totalWins,
      totalRounds: profile.totalRounds,
    }).catch(() => {});
    onAuthSuccess(authToken, profile);
  };

  // 1. Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const loginId = identifier.trim() || email.trim();
      let firebaseIdToken: string | undefined;
      let firestoreProfile: Record<string, any> | null | undefined;

      if (loginId.includes('@')) {
        const fbSign = await signInWithFirebaseEmail(loginId, password);
        if (fbSign.success && fbSign.emailVerified && fbSign.idToken) {
          firebaseIdToken = fbSign.idToken;
          firestoreProfile = fbSign.firestoreProfile;
        }
      }

      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginId,
          email: loginId,
          password,
          firebaseIdToken,
          firestoreProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresVerification) {
          const targetEmail = String(data.email || loginId).trim();
          setAssignedPlayerId(data.playerId || '');
          setPendingEmail(targetEmail);
          setIdentifier(targetEmail);
          setVerifyCode('');
          setSmtpEmailSent(Boolean(data.emailSent));
          if (data.verificationToken) {
            setVerificationToken(String(data.verificationToken));
          }

          if (targetEmail.includes('@') && password) {
            const fbRes = await dispatchFirebaseVerificationEmail(
              targetEmail,
              password,
              data.playerId
            );
            if (fbRes.alreadyVerified && fbRes.idToken) {
              const verifyRes = await apiFetch('/api/auth/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  identifier: targetEmail,
                  email: targetEmail,
                  firebaseIdToken: fbRes.idToken,
                  verificationToken: data.verificationToken,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.token && verifyData.user) {
                await completeVerifiedSignIn(verifyData.token, verifyData.user);
                return;
              }
            }
            setFirebaseEmailSent(fbRes.emailSent);
            setFirebaseProviderDisabled(Boolean(fbRes.providerDisabled));
          }

          setScreen('verify');
          setError(null);
          setSuccessMsg(
            `Please verify your email (${targetEmail}) to complete sign in.`
          );
        } else {
          setError(data.error || 'Invalid login credentials.');
        }
      } else {
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Register Handler -> Sends real email & opens Verification Step (never displays code on screen)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanDisplay = username.trim() || previewPlayerId;
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: previewPlayerId,
          displayName: cleanDisplay,
          email: cleanEmail,
          password,
          preferredSeat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create account.');
      } else if (data.requiresVerification) {
        const playerId = data.playerId || previewPlayerId;
        setAssignedPlayerId(playerId);
        setPendingEmail(cleanEmail);
        setIdentifier(cleanEmail);
        setVerifyCode('');
        setSmtpEmailSent(Boolean(data.emailSent));
        if (data.verificationToken) {
          setVerificationToken(String(data.verificationToken));
        }

        // Dispatch real verification email via Firebase Auth as well
        const fbRes = await dispatchFirebaseVerificationEmail(
          cleanEmail,
          password,
          cleanDisplay
        );

        if (fbRes.alreadyVerified && fbRes.idToken) {
          const verifyRes = await apiFetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: cleanEmail,
              email: cleanEmail,
              firebaseIdToken: fbRes.idToken,
              verificationToken: data.verificationToken,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.token && verifyData.user) {
            await completeVerifiedSignIn(verifyData.token, verifyData.user);
            return;
          }
        }

        setFirebaseEmailSent(fbRes.emailSent);
        setFirebaseProviderDisabled(Boolean(fbRes.providerDisabled));
        setScreen('verify');

        if (data.emailSent) {
          setSuccessMsg(
            `6-digit verification code sent to ${cleanEmail}. Check your inbox and enter it below.`
          );
        } else if (fbRes.emailSent) {
          setSuccessMsg(
            `Verification email sent to ${cleanEmail}! Click the link in your email, then tap "I Clicked the Email Link" below.`
          );
        } else {
          setSuccessMsg(
            `Account ${playerId} created! Verify ownership of ${cleanEmail} below to activate your account.`
          );
        }
      } else if (data.token && data.user) {
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Unable to register right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3A. Verify 6-Digit Code from Email
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = pendingEmail || identifier.trim() || email.trim() || assignedPlayerId;
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          code: verifyCode.trim(),
          verificationToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid 6-digit verification code.');
      } else {
        setVerifyCode('');
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3B. Check Firebase Email Verification Link Status
  const handleCheckFirebaseEmailLink = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = pendingEmail || email.trim() || identifier.trim();
      const status = await checkFirebaseEmailVerificationStatus(lookup, password);
      if (!status.verified || !status.idToken) {
        setError(
          status.error ||
            'Email not verified yet. Open your email inbox, click the verification link, and try again.'
        );
        return;
      }

      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          firebaseIdToken: status.idToken,
          verificationToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not complete email verification.');
      } else {
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Could not verify email status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3C. Verify Email Ownership via Firebase Google Popup (keeps custom Player ID & password)
  const handleVerifyEmailWithGoogle = async () => {
    const targetEmail = (pendingEmail || email.trim() || identifier.trim()).toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Valid email address required for verification.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const result = await verifyEmailOwnershipWithGooglePopup(targetEmail);
      if (!result.verified || !result.idToken) {
        setError(result.error || 'Email verification was not completed.');
        return;
      }

      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: targetEmail,
          email: targetEmail,
          firebaseIdToken: result.idToken,
          verificationToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not activate account.');
      } else {
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Google email ownership verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Resend Verification Email
  const handleResendCode = async () => {
    const lookup = pendingEmail || identifier.trim() || email.trim() || assignedPlayerId;
    if (!lookup) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          verificationToken,
        }),
      });
      const data = await res.json();
      if (data.verificationToken) {
        setVerificationToken(String(data.verificationToken));
      }
      setSmtpEmailSent(Boolean(data.emailSent));

      let fbSent = false;
      if (lookup.includes('@') && password) {
        const fbRes = await dispatchFirebaseVerificationEmail(
          lookup,
          password,
          assignedPlayerId
        );
        fbSent = fbRes.emailSent;
        setFirebaseEmailSent(fbRes.emailSent);
        setFirebaseProviderDisabled(Boolean(fbRes.providerDisabled));
      }

      if (res.ok) {
        if (data.emailSent || fbSent) {
          setSuccessMsg(`Verification email resent to ${ data.email || lookup }. Check your inbox and Spam folder.`);
        } else {
          setSuccessMsg('A fresh verification request was generated.');
        }
      } else {
        setError(data.error || 'Could not resend verification email.');
      }
    } catch {
      setError('Could not resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Forgot Password Request
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = identifier.trim() || email.trim();
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: lookup, email: lookup }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Account not found.');
      } else {
        const targetEmail = String(data.email || lookup).trim();
        setPendingEmail(targetEmail);
        setResetCode('');
        if (data.resetToken) {
          setResetToken(String(data.resetToken));
        }
        if (targetEmail.includes('@')) {
          const fbReset = await dispatchFirebasePasswordResetEmail(targetEmail);
          setFirebaseResetSent(fbReset.sent);
        }
        setResetStep('confirm');
        setSuccessMsg(
          `Password reset instructions sent for ${targetEmail}. Enter your 6-digit email code or verify email ownership below.`
        );
      }
    } catch {
      setError('Could not request password reset.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Confirm Password Reset
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const lookup = pendingEmail || identifier.trim() || email.trim();
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: lookup,
          email: lookup,
          code: resetCode.trim(),
          newPassword,
          resetToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not reset password.');
      } else {
        setResetStep('request');
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  // 6B. Reset Password by Verifying Email Ownership with Google
  const handleResetWithGoogleVerification = async () => {
    const targetEmail = (pendingEmail || identifier.trim() || email.trim()).toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Please enter your registered email address first.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError('Enter your new password (at least 6 characters) first.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const result = await verifyEmailOwnershipWithGooglePopup(targetEmail);
      if (!result.verified || !result.idToken) {
        setError(result.error || 'Email verification cancelled.');
        return;
      }
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: targetEmail,
          email: targetEmail,
          newPassword,
          firebaseIdToken: result.idToken,
          resetToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update password.');
      } else {
        setResetStep('request');
        await completeVerifiedSignIn(data.token, data.user);
      }
    } catch {
      setError('Could not update password.');
    } finally {
      setLoading(false);
    }
  };

  const ALL_SEATS: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

  const headerTitle = user
    ? 'Player Profile'
    : screen === 'verify'
    ? 'Verify Your Email'
    : screen === 'forgot'
    ? 'Reset Password'
    : mainTab === 'login'
    ? 'Welcome Back'
    : 'Create Account';

  const headerSubtitle = user
    ? `Player ID: ${user.playerId || user.uid}`
    : screen === 'verify'
    ? `Sent to ${pendingEmail || email || 'your email'}`
    : screen === 'forgot'
    ? 'Recover access to your Player ID'
    : mainTab === 'login'
    ? 'Sign in with your Email or Player ID'
    : 'Get your unique Player ID & 1,000 RC stack';

  return (
    <div
      role="dialog"
      aria-label="Player Account"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/10 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Clean Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white">
                {headerTitle}
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[240px]">
                {headerSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Modal"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/75 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200 font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl bg-emerald-950/75 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-200 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SIGNED-IN VIEW */}
        {user ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white truncate">
                      {user.displayName}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Verified
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-amber-300 font-mono truncate">
                      ID: {user.playerId || user.uid}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(user.playerId || user.uid);
                        setCopiedProfileId(true);
                        setTimeout(() => setCopiedProfileId(false), 1500);
                      }}
                      className="text-slate-400 hover:text-white cursor-pointer"
                      title="Copy Player ID"
                    >
                      {copiedProfileId ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Balance</span>
                <span className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1 mt-1 tabular-nums">
                  <Coins className="w-3.5 h-3.5" />
                  {user.coins.toLocaleString()} RC
                </span>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Best Stack</span>
                <span className="text-sm font-bold text-amber-300 flex items-center justify-center gap-1 mt-1 tabular-nums">
                  <Trophy className="w-3.5 h-3.5" />
                  {user.highestBalance.toLocaleString()} RC
                </span>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <span className="text-[11px] text-slate-400 block">Wins / Hands</span>
                <span className="text-sm font-bold text-sky-300 block mt-1 tabular-nums">
                  {user.totalWins} / {user.totalRounds}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-300">
                Table Seat (A–F)
              </span>
              <div className="grid grid-cols-6 gap-1.5">
                {ALL_SEATS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSelectSeat(s)}
                    className={`py-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                      user.preferredSeat === s
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-slate-900/80 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {sessions.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recent Hands</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {sessions.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-xs bg-slate-900/60 border border-white/5 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-slate-300">
                        Hukam <b className="text-amber-300">{s.pointCard}</b> •{' '}
                        {s.winningSide === 'player' ? 'Bahar' : 'Andar'}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          s.coinDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {s.coinDelta >= 0 ? `+${s.coinDelta}` : s.coinDelta} RC
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* SIGNED-OUT VIEW: ONLY 2 TOP TABS (LOGIN & REGISTER) */
          <div className="flex flex-col gap-4">
            {(screen === 'login' || screen === 'register') && (
              <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => switchMainTab('login')}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mainTab === 'login'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => switchMainTab('register')}
                  className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mainTab === 'register'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Register
                </button>
              </div>
            )}

            {/* SCREEN 1: LOGIN */}
            {screen === 'login' && (
              <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Email or Player ID
                  </span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter your Email or Player ID"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Password</span>
                    <button
                      type="button"
                      onClick={() => {
                        setScreen('forgot');
                        setResetStep('request');
                        setError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs font-semibold text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50 mt-1"
                >
                  {loading ? 'Signing In...' : 'Login'}
                </button>
              </form>
            )}

            {/* SCREEN 2: REGISTER */}
            {screen === 'register' && (
              <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Username
                    </span>
                    <span className="text-[11px] font-mono text-amber-300/90">
                      Player ID: {previewPlayerId}
                    </span>
                  </div>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your player name"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Email Address
                  </span>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Password
                  </span>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-300">
                    Starting Seat (1,000 RC Stack)
                  </span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {ALL_SEATS.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setPreferredSeat(s)}
                        className={`py-2 rounded-lg font-bold text-xs border cursor-pointer transition-all ${
                          preferredSeat === s
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-white/5'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50 mt-1"
                >
                  {loading ? 'Creating Account...' : 'Register'}
                </button>
              </form>
            )}

            {/* SCREEN 3: EMAIL VERIFICATION STEP (NO ON-SCREEN CODE LEAK) */}
            {screen === 'verify' && (
              <div className="flex flex-col gap-3.5">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Your Player ID:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {assignedPlayerId || previewPlayerId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
                    <span className="text-slate-400">Email Inbox:</span>
                    <span className="font-medium text-slate-200 truncate max-w-[200px]">
                      {pendingEmail || email || identifier}
                    </span>
                  </div>
                </div>

                {/* Primary Action 1: When Firebase verification email link was sent */}
                {firebaseEmailSent && (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-3 text-xs text-emerald-200 leading-relaxed">
                      Verification link sent to <b>{pendingEmail || email}</b> from{' '}
                      <code className="text-emerald-300">
                        noreply@reference-feat-r07pf.firebaseapp.com
                      </code>
                      . Open your email inbox (or Spam folder), click the link, then tap below:
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckFirebaseEmailLink}
                      disabled={loading}
                      className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>I Clicked the Email Verification Link — Sign In</span>
                    </button>
                  </div>
                )}

                {/* Primary Action 2: Real Google / Gmail Ownership Verification via Firebase */}
                <button
                  type="button"
                  onClick={handleVerifyEmailWithGoogle}
                  disabled={loading}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 ${
                    !firebaseEmailSent && !smtpEmailSent
                      ? 'text-slate-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400 hover:brightness-105 shadow-lg'
                      : 'bg-white/8 hover:bg-white/12 border border-white/15 text-slate-100'
                  }`}
                >
                  <ShieldCheck
                    className={`w-4 h-4 ${
                      !firebaseEmailSent && !smtpEmailSent
                        ? 'text-slate-950'
                        : 'text-emerald-400'
                    }`}
                  />
                  <span>
                    Verify {pendingEmail || email || 'Gmail'} with Google
                  </span>
                </button>

                {/* Primary Action 3: 6-Digit Email Code (only shown when SMTP 6-digit email is active) */}
                {smtpEmailSent && (
                  <form onSubmit={handleVerifyCode} className="flex flex-col gap-2.5 pt-1 border-t border-white/10">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        Enter 6-Digit Code from Email
                      </span>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          maxLength={6}
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit code sent to your email"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm font-mono tracking-widest text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={loading || verifyCode.trim().length < 6}
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {loading ? 'Verifying...' : 'Verify 6-Digit Code & Sign In'}
                    </button>
                  </form>
                )}

                {firebaseProviderDisabled && !smtpEmailSent && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-2.5 text-[11px] text-amber-200/90 leading-relaxed">
                    <span className="font-semibold block text-amber-300 mb-0.5">
                      Firebase Status Check:
                    </span>
                    <b>Google / Gmail verification is ACTIVE</b> (click the green button above). To also send automated link emails from{' '}
                    <code className="text-amber-300">
                      noreply@reference-feat-r07pf.firebaseapp.com
                    </code>
                    , make sure <b>Email/Password</b> is toggled ON and saved in{' '}
                    <a
                      href="https://console.firebase.google.com/project/reference-feat-r07pf/authentication/providers"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-amber-300 inline-flex items-center gap-0.5"
                    >
                      Firebase Console → Sign-in method
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    , then tap <b>Resend Email</b> below.
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => switchMainTab('register')}
                    className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Resend Email</span>
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN 4: FORGOT PASSWORD (ACCESSED FROM LOGIN) */}
            {screen === 'forgot' && (
              <div className="flex flex-col gap-3.5">
                {resetStep === 'request' ? (
                  <form onSubmit={handleRequestReset} className="flex flex-col gap-3.5">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        Email or Player ID
                      </span>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="Enter your Email or Player ID"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {loading ? 'Sending Reset Email...' : 'Send Reset Instructions'}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMainTab('login')}
                      className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 pt-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Login</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmReset} className="flex flex-col gap-3.5">
                    {firebaseResetSent && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-3 text-xs text-emerald-200">
                        A Firebase password reset link was also sent to{' '}
                        <b>{pendingEmail || identifier}</b>.
                      </div>
                    )}

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        6-Digit Reset Code from Email
                      </span>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          maxLength={6}
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit code from email"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm font-mono tracking-widest text-white placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-300">
                        New Password
                      </span>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={loading || resetCode.trim().length < 6}
                      className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-400 hover:brightness-105 shadow-lg cursor-pointer transition-all disabled:opacity-50"
                    >
                      {loading ? 'Updating Password...' : 'Update Password with Code'}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetWithGoogleVerification}
                      disabled={loading}
                      className="w-full py-2.5 px-3.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/15 text-xs font-semibold text-slate-100 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-300" />
                      <span>Verify Email via Google & Update Password</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMainTab('login')}
                      className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 pt-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Login</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
