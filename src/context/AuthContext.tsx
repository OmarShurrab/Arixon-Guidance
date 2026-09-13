import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, getUserProfile, logOut, signInWithGoogle, touchUserActivity } from '../lib/firebase';
import type { UserProfile } from '../types';

export type AuthStatus = 
  | 'initializing'           // Checking auth state on load
  | 'unauthenticated'        // No user logged in
  | 'needs_profile_setup'    // Logged in with Firebase, but no Firestore profile document yet
  | 'authenticated'          // Logged in and Firestore profile loaded
  | 'error';                 // Error encountered

interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfileOptimistic: (profile: UserProfile) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfileForUser = useCallback(async (firebaseUser: User) => {
    // 1. Check instant local cache first so user NEVER experiences delays, stuck screens, or offline lockout
    try {
      const cached = localStorage.getItem(`arixon_cached_profile_${firebaseUser.uid}`);
      if (cached) {
        const parsed = JSON.parse(cached) as UserProfile;
        setProfile(parsed);
        setStatus('authenticated');
      }
    } catch {
      // Ignore
    }

    try {
      const existingProfile = await getUserProfile(firebaseUser.uid);
      if (existingProfile) {
        setProfile(existingProfile);
        setStatus('authenticated');
        // Non-blocking activity touch
        touchUserActivity(firebaseUser.uid);
      } else {
        // Only trigger setup if truly no profile exists locally or remotely
        const hasCached = localStorage.getItem(`arixon_cached_profile_${firebaseUser.uid}`);
        if (!hasCached) {
          setProfile(null);
          setStatus('needs_profile_setup');
        }
      }
    } catch (err: unknown) {
      console.warn('Network issue checking user profile from Firestore:', err);
      // If we already have a cached profile, keep user authenticated seamlessly!
      const cached = localStorage.getItem(`arixon_cached_profile_${firebaseUser.uid}`);
      if (cached) {
        setProfile(JSON.parse(cached) as UserProfile);
        setStatus('authenticated');
      } else {
        const errorMessage = err instanceof Error ? err.message : 'فشل الاتصال بقاعدة البيانات';
        setError(errorMessage);
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setError(null);
      if (currentUser) {
        setUser(currentUser);
        await loadProfileForUser(currentUser);
      } else {
        setUser(null);
        setProfile(null);
        setStatus('unauthenticated');
      }
    });

    return () => unsubscribe();
  }, [loadProfileForUser]);

  const signIn = async () => {
    try {
      setError(null);
      const signedInUser = await signInWithGoogle();
      setUser(signedInUser);
      await loadProfileForUser(signedInUser);
    } catch (err: unknown) {
      console.error('Sign-in error:', err);
      // Don't show scary error if user closed the popup window
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        return;
      }
      const message = err instanceof Error ? err.message : 'فشل تسجيل الدخول عبر Google. يرجى المحاولة مجدداً.';
      setError(message);
    }
  };

  const handleSignOut = async () => {
    try {
      if (user?.uid) {
        try {
          localStorage.removeItem(`arixon_cached_profile_${user.uid}`);
        } catch {
          // ignore
        }
      }
      setError(null);
      await logOut();
      setUser(null);
      setProfile(null);
      setStatus('unauthenticated');
    } catch (err: unknown) {
      console.error('Sign-out error:', err);
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء تسجيل الخروج';
      setError(message);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfileForUser(user);
    }
  };

  const setProfileOptimistic = (newProfile: UserProfile) => {
    try {
      localStorage.setItem(`arixon_cached_profile_${newProfile.uid}`, JSON.stringify(newProfile));
    } catch {
      // ignore
    }
    setProfile(newProfile);
    setStatus('authenticated');
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        profile,
        error,
        signIn,
        signOut: handleSignOut,
        refreshProfile,
        setProfileOptimistic,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
