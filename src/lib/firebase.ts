import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signInWithPopup,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface FirebaseVerificationDispatch {
  emailSent: boolean;
  alreadyVerified: boolean;
  idToken?: string;
  providerDisabled?: boolean;
  error?: string;
}

/**
 * Registers or signs in the user with Firebase Email/Password Auth and triggers
 * Firebase's real verification email (`sendEmailVerification`) to their inbox.
 */
export async function dispatchFirebaseVerificationEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<FirebaseVerificationDispatch> {
  try {
    let userCred;
    try {
      userCred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(userCred.user, { displayName }).catch(() => {});
      }
    } catch (createErr: any) {
      if (createErr?.code === 'auth/email-already-in-use') {
        userCred = await signInWithEmailAndPassword(auth, email, password);
        if (displayName && !userCred.user.displayName) {
          await updateProfile(userCred.user, { displayName }).catch(() => {});
        }
      } else {
        throw createErr;
      }
    }

    await userCred.user.reload();
    if (userCred.user.emailVerified) {
      const idToken = await userCred.user.getIdToken(true);
      return { emailSent: false, alreadyVerified: true, idToken };
    }

    await sendEmailVerification(userCred.user);
    return { emailSent: true, alreadyVerified: false };
  } catch (err: any) {
    const code = String(err?.code || err?.message || '');
    if (code.includes('operation-not-allowed') || code.includes('OPERATION_NOT_ALLOWED')) {
      return {
        emailSent: false,
        alreadyVerified: false,
        providerDisabled: true,
      };
    }
    return {
      emailSent: false,
      alreadyVerified: false,
      error: err instanceof Error ? err.message : 'Could not send Firebase verification email',
    };
  }
}

/**
 * Signs in with Firebase Email/Password (used during Login to support cross-device
 * sign-in and accounts whose password was reset via a Firebase password reset email link).
 */
export async function signInWithFirebaseEmail(
  email: string,
  password: string
): Promise<{
  success: boolean;
  emailVerified: boolean;
  idToken?: string;
  firestoreProfile?: Record<string, any> | null;
  displayName?: string | null;
}> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await cred.user.reload();
    const idToken = await cred.user.getIdToken(true);
    let firestoreProfile: Record<string, any> | null = null;
    if (cred.user.emailVerified) {
      try {
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        if (snap.exists()) {
          firestoreProfile = snap.data();
        }
      } catch {
        // Ignore read error
      }
    }
    return {
      success: true,
      emailVerified: cred.user.emailVerified,
      idToken,
      firestoreProfile,
      displayName: cred.user.displayName,
    };
  } catch {
    return { success: false, emailVerified: false };
  }
}

/**
 * Checks whether the current Firebase user has clicked the verification link in their email.
 */
export async function checkFirebaseEmailVerificationStatus(
  email?: string,
  password?: string
): Promise<{ verified: boolean; idToken?: string; error?: string }> {
  try {
    if (!auth.currentUser && email && password) {
      await signInWithEmailAndPassword(auth, email, password);
    }
    if (!auth.currentUser) {
      return { verified: false, error: 'No active verification session found.' };
    }
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      const idToken = await auth.currentUser.getIdToken(true);
      return { verified: true, idToken };
    }
    return {
      verified: false,
      error: 'Your email is not verified yet. Please click the verification link sent to your email inbox first.',
    };
  } catch (err: any) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : 'Unable to check verification status.',
    };
  }
}

/**
 * Verifies ownership of the registered email address using Firebase Google Auth popup
 * while keeping the player's custom Player ID and password account.
 */
export async function verifyEmailOwnershipWithGooglePopup(
  expectedEmail: string
): Promise<{ verified: boolean; idToken?: string; error?: string }> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
      login_hint: expectedEmail.trim(),
    });
    const cred = await signInWithPopup(auth, provider);
    const googleEmail = (cred.user.email || '').trim().toLowerCase();
    if (googleEmail !== expectedEmail.trim().toLowerCase()) {
      return {
        verified: false,
        error: `Selected Google account (${googleEmail}) does not match ${expectedEmail}. Please select ${expectedEmail}.`,
      };
    }
    const idToken = await cred.user.getIdToken(true);
    return { verified: true, idToken };
  } catch (err: any) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : 'Google email verification was cancelled.',
    };
  }
}

/**
 * Sends a Firebase password reset email if Email/Password provider is enabled.
 */
export async function dispatchFirebasePasswordResetEmail(
  email: string
): Promise<{ sent: boolean; providerDisabled?: boolean }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return { sent: true };
  } catch (err: any) {
    const code = String(err?.code || err?.message || '');
    if (code.includes('operation-not-allowed') || code.includes('OPERATION_NOT_ALLOWED')) {
      return { sent: false, providerDisabled: true };
    }
    return { sent: false };
  }
}

/**
 * Syncs the verified player's profile to Firestore `/users/{uid}` when signed into Firebase Auth.
 */
export async function syncVerifiedProfileToFirestore(profile: {
  playerId: string;
  displayName: string;
  email: string;
  preferredSeat: string;
  coins: number;
  highestBalance: number;
  totalWins: number;
  totalRounds: number;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;
  const path = `users/${currentUser.uid}`;
  const ref = doc(db, 'users', currentUser.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: currentUser.uid,
        playerId: profile.playerId.slice(0, 32),
        displayName: profile.displayName.slice(0, 64),
        email: profile.email.slice(0, 128),
        preferredSeat: ['A', 'B', 'C', 'D', 'E', 'F'].includes(profile.preferredSeat)
          ? profile.preferredSeat
          : 'D',
        coins: Math.max(0, Math.round(profile.coins)),
        highestBalance: Math.max(0, Math.round(profile.highestBalance)),
        totalWins: Math.max(0, Math.round(profile.totalWins)),
        totalRounds: Math.max(0, Math.round(profile.totalRounds)),
        emailVerified: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        ref,
        {
          displayName: profile.displayName.slice(0, 64),
          preferredSeat: ['A', 'B', 'C', 'D', 'E', 'F'].includes(profile.preferredSeat)
            ? profile.preferredSeat
            : 'D',
          coins: Math.max(0, Math.round(profile.coins)),
          highestBalance: Math.max(0, Math.round(profile.highestBalance)),
          totalWins: Math.max(0, Math.round(profile.totalWins)),
          totalRounds: Math.max(0, Math.round(profile.totalRounds)),
          emailVerified: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    // Only throw structured FirestoreErrorInfo if permission-denied
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}
