import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { DailyChallengeConfig, DailyLeaderboardEntry, RunSummary } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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
void testConnection();

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    throw error;
  }
}

export async function signOutPilot(): Promise<void> {
  await signOut(auth);
}

function deriveSafePilotName(user: User): string {
  const rawDisplay = (user.displayName || '').trim();
  const fallbackFromEmail = user.email ? user.email.split('@')[0] : '';
  const candidate = rawDisplay || fallbackFromEmail || 'Rogue Pilot';
  return candidate.replace(/\s+/g, ' ').slice(0, 32) || 'Rogue Pilot';
}

function clampInt(val: number, min: number, max: number): number {
  const rounded = Math.round(Number.isFinite(val) ? val : 0);
  return Math.max(min, Math.min(max, rounded));
}

export function subscribeDailyLeaderboard(
  dateKey: string,
  onUpdate: (entries: DailyLeaderboardEntry[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'daily_scores';
  const q = query(collection(db, path), where('dateKey', '==', dateKey), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: DailyLeaderboardEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          uid: String(d.uid || ''),
          dateKey: String(d.dateKey || dateKey),
          challengeCode: String(d.challengeCode || ''),
          pilotName: String(d.pilotName || 'Rogue Pilot'),
          shipId: String(d.shipId || ''),
          shipName: String(d.shipName || ''),
          mutatorName: String(d.mutatorName || ''),
          score: Number(d.score || 0),
          kills: Number(d.kills || 0),
          survivalTime: Number(d.survivalTime || 0),
          level: Number(d.level || 1),
          bossesDefeated: Number(d.bossesDefeated || 0),
        };
      });

      entries.sort((a, b) => b.score - a.score || b.survivalTime - a.survivalTime);
      onUpdate(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function submitDailyScore(
  user: User,
  summary: RunSummary,
  config: DailyChallengeConfig
): Promise<{ submitted: boolean; isNewPersonalBest: boolean; bestScore: number }> {
  const dateKey = summary.dailyDateKey || config.dateKey;
  const challengeCode = (summary.dailyChallengeCode || config.challengeCode).slice(0, 32);
  const mutatorName = (summary.dailyMutatorName || config.mutator.name).slice(0, 48);
  const entryId = `${dateKey}_${user.uid}`;
  const docPath = `daily_scores/${entryId}`;
  const docRef = doc(db, 'daily_scores', entryId);

  const clampedScore = clampInt(summary.score, 0, 100000000);
  const clampedKills = clampInt(summary.kills, 0, 1000000);
  const clampedTime = clampInt(summary.survivalTime, 0, 86400);
  const clampedLevel = clampInt(summary.level, 1, 999);
  const clampedBosses = clampInt(summary.bossesDefeated, 0, 1000);
  const pilotName = deriveSafePilotName(user);
  const shipId = summary.shipId.slice(0, 32);
  const shipName = summary.shipName.slice(0, 48);

  let existingSnap;
  try {
    existingSnap = await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(docRef, {
        uid: user.uid,
        dateKey,
        challengeCode,
        pilotName,
        shipId,
        shipName,
        mutatorName,
        score: clampedScore,
        kills: clampedKills,
        survivalTime: clampedTime,
        level: clampedLevel,
        bossesDefeated: clampedBosses,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { submitted: true, isNewPersonalBest: true, bestScore: clampedScore };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  } else {
    const prevScore = Number(existingSnap.data().score || 0);
    if (clampedScore > prevScore) {
      try {
        await updateDoc(docRef, {
          pilotName,
          score: clampedScore,
          kills: clampedKills,
          survivalTime: clampedTime,
          level: clampedLevel,
          bossesDefeated: clampedBosses,
          updatedAt: serverTimestamp(),
        });
        return { submitted: true, isNewPersonalBest: true, bestScore: clampedScore };
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    }
    return { submitted: false, isNewPersonalBest: false, bestScore: prevScore };
  }
}
