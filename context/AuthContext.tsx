import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { authService } from '../services/authService';
import {
  authReducer,
  initialAuthState,
  roleOf,
  type AuthStatus,
} from '../services/auth/authState';
import { startAuthSync, type AuthSync } from '../services/auth/authSync';
import type { FacultyProfileEditInput, ProfileEditInput } from '../services/auth/authValidation';
import type { SignUpResult } from '../services/auth/createAuthService';
import type { AuthUser, UserProfile, UserRole } from '../types/User';

export interface AuthContextValue {
  status: AuthStatus;
  /** False until Firebase has reported who (if anyone) is signed in. */
  initialized: boolean;
  /** True while the session or the signed-in user's profile is still being resolved. */
  loading: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
  /** The role from the user's profile. Null unless authenticated. */
  role: UserRole | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string, profileData: { name: string }) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /**
   * Saves the signed-in user's own editable fields (a student's name, university, program and
   * branch, or a faculty member's name, university and department), then updates the shared profile
   * state so every screen shows the new values at once. Role and email cannot change.
   */
  updateProfile: (input: ProfileEditInput | FacultyProfileEditInput) => Promise<void>;
  /** Reads the profile again after a profile error. */
  retryProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function log(message: string, error?: unknown) {
  if (__DEV__) console.warn(`[auth] ${message}`, error);
}

/**
 * The one place that listens to Firebase Authentication. Everything else reads from useAuth().
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const sync = useRef<AuthSync | null>(null);

  useEffect(() => {
    const started = startAuthSync(authService, dispatch, log);

    sync.current = started;

    return () => {
      started.stop();
      sync.current = null;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      initialized: state.initialized,
      loading: state.status === 'loading',
      user: state.user,
      profile: state.profile,
      role: roleOf(state),
      signIn: authService.signIn,
      signUp: authService.signUp,
      signOut: authService.signOut,
      updateProfile: async (input) => {
        const fields = await authService.updateProfile(input);
        const uid = authService.getCurrentUserId();

        if (uid) dispatch({ type: 'profile-updated', uid, fields });
      },
      retryProfile: async () => {
        if (state.user) await sync.current?.reloadProfile(state.user);
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');

  return context;
}
