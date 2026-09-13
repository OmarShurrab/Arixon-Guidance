import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User,
  Auth
} from 'firebase/auth';
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where,
  Firestore
} from 'firebase/firestore';
import type { UserProfile, LeaderboardEntry, Exam, SubjectId } from '../types';
import configJson from '../../firebase-applet-config.json';

// Initialize Firebase
const firebaseConfig = {
  projectId: configJson.projectId,
  appId: configJson.appId,
  apiKey: configJson.apiKey,
  authDomain: configJson.authDomain,
  storageBucket: configJson.storageBucket,
  messagingSenderId: configJson.messagingSenderId,
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const dbId = configJson.firestoreDatabaseId && configJson.firestoreDatabaseId !== '(default)'
  ? configJson.firestoreDatabaseId 
  : undefined;

// Enable persistent multi-tab offline caching so the app works seamlessly offline and syncs automatically
let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, dbId);
} catch {
  // If already initialized in hot reload
  firestoreDb = getFirestore(app, dbId);
}

export const db: Firestore = firestoreDb;

export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

/**
 * Clean data helper to recursively remove any undefined fields before sending to Firestore
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(data: T): Partial<T> {
  const clean: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizeFirestoreData(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Sign out
 */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * Check and get user profile from Firestore with local offline fallback
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const profileData = userDoc.data() as UserProfile;
      try {
        localStorage.setItem(`arixon_cached_profile_${uid}`, JSON.stringify(profileData));
      } catch {
        // Storage full or disabled
      }
      return profileData;
    }
    // Check if we have cached profile
    try {
      const cached = localStorage.getItem(`arixon_cached_profile_${uid}`);
      if (cached) {
        return JSON.parse(cached) as UserProfile;
      }
    } catch {
      // Ignore
    }
    return null;
  } catch (error) {
    console.warn('Network issue fetching user profile, checking offline storage:', error);
    try {
      const cached = localStorage.getItem(`arixon_cached_profile_${uid}`);
      if (cached) {
        return JSON.parse(cached) as UserProfile;
      }
    } catch {
      // Ignore
    }
    throw error;
  }
}

/**
 * Check if a username is already taken by another user
 */
export async function isUsernameTaken(username: string, excludeUid?: string): Promise<boolean> {
  try {
    const q = query(collection(db, 'users'), where('username', '==', username.trim().toLowerCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return false;
    if (excludeUid) {
      return snapshot.docs.some(d => d.id !== excludeUid);
    }
    return true;
  } catch (error) {
    console.error('Error checking username:', error);
    return false;
  }
}

/**
 * Create a new user profile on first onboarding
 */
export async function createUserProfile(
  user: User, 
  details: {
    username: string;
    displayName: string;
    age?: number;
    city?: string;
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
    whatsappGroup?: string;
    photoURL?: string;
  }
): Promise<UserProfile> {
  const now = new Date().toISOString();
  
  const rawProfile: any = {
    uid: user.uid,
    username: details.username.trim().toLowerCase(),
    displayName: details.displayName.trim() || user.displayName || 'طالب أريكسون',
    email: user.email || '',
    totalPoints: 0,
    weeklyPoints: 0,
    monthlyPoints: 0,
    examsCompleted: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };

  if (details.photoURL || user.photoURL) {
    rawProfile.photoURL = details.photoURL || user.photoURL;
  }
  if (details.age !== undefined && !isNaN(Number(details.age))) {
    rawProfile.age = Number(details.age);
  }
  if (details.city && details.city.trim()) {
    rawProfile.city = details.city.trim();
  }
  if (details.gender) {
    rawProfile.gender = details.gender;
  }
  if (details.whatsappGroup && details.whatsappGroup.trim()) {
    rawProfile.whatsappGroup = details.whatsappGroup.trim();
  }

  // Sanitize data so no undefined field is ever sent to Firestore
  const profile = sanitizeFirestoreData(rawProfile) as UserProfile;

  const userDocRef = doc(db, 'users', user.uid);
  await setDoc(userDocRef, profile, { merge: true });

  // Save to local cache immediately for persistent offline access
  try {
    localStorage.setItem(`arixon_cached_profile_${user.uid}`, JSON.stringify(profile));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }

  return profile;
}

/**
 * Update existing user profile
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'username' | 'age' | 'city' | 'gender' | 'whatsappGroup' | 'photoURL'>>
): Promise<void> {
  const rawUpdates: any = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Ensure age is clean number or omit
  if (rawUpdates.age !== undefined && isNaN(Number(rawUpdates.age))) {
    delete rawUpdates.age;
  }
  // Ensure strings are trimmed
  if (rawUpdates.whatsappGroup !== undefined && !rawUpdates.whatsappGroup?.trim()) {
    delete rawUpdates.whatsappGroup;
  }

  const cleanUpdates = sanitizeFirestoreData(rawUpdates);
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, cleanUpdates);

  // Update local cache
  try {
    const cachedStr = localStorage.getItem(`arixon_cached_profile_${uid}`);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      localStorage.setItem(`arixon_cached_profile_${uid}`, JSON.stringify({ ...cached, ...cleanUpdates }));
    }
  } catch (e) {
    console.warn('LocalStorage update failed:', e);
  }
}


/**
 * Update last active timestamp
 */
export async function touchUserActivity(uid: string): Promise<void> {
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      lastActiveAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Query real leaderboard from Firestore
 */
export async function fetchLeaderboard(period: 'all' | 'weekly' | 'monthly'): Promise<LeaderboardEntry[]> {
  try {
    const pointsField = period === 'weekly' ? 'weeklyPoints' : period === 'monthly' ? 'monthlyPoints' : 'totalPoints';
    const q = query(
      collection(db, 'users'),
      orderBy(pointsField, 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(q);
    
    let currentRank = 1;
    const entries: LeaderboardEntry[] = [];
    
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() as UserProfile;
      const points = data[pointsField] || 0;
      // Only include if user has earned points or has valid profile
      if (points > 0) {
        entries.push({
          uid: data.uid,
          username: data.username || 'مستخدم',
          displayName: data.displayName || data.username,
          photoURL: data.photoURL,
          points,
          rank: currentRank++,
        });
      }
    });

    return entries;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

/**
 * Fetch available exams from Firestore (Phase 1 structure, ready for real exams in Firestore)
 */
export async function fetchExams(subjectFilter?: SubjectId): Promise<Exam[]> {
  try {
    const examsRef = collection(db, 'exams');
    let q;
    if (subjectFilter && subjectFilter !== 'all') {
      q = query(examsRef, where('subject', '==', subjectFilter));
    } else {
      q = query(examsRef);
    }
    const snapshot = await getDocs(q);
    const exams: Exam[] = [];
    snapshot.forEach((docSnapshot) => {
      exams.push({ id: docSnapshot.id, ...(docSnapshot.data() as Omit<Exam, 'id'>) });
    });
    return exams;
  } catch (error) {
    console.warn('Exams collection empty or query failed:', error);
    return [];
  }
}

export * from './examService';
