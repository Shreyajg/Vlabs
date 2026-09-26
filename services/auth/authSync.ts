import type { AuthUser } from "../../types/User";
import type { AuthAction } from "./authState";
import type { AuthLogger, AuthService } from "./createAuthService";

// Pure module: turns Firebase's auth-state events into AuthActions.
// AuthProvider starts exactly one of these, which is what keeps the app to a single listener.

export interface AuthSync {
  stop(): void;
  /** Reads the profile again for the signed-in user (used by "Try again" after a profile error). */
  reloadProfile(user: AuthUser): Promise<void>;
}

export function startAuthSync(
  service: Pick<AuthService, "subscribeToAuthState" | "loadUserProfile">,
  dispatch: (action: AuthAction) => void,
  log: AuthLogger = () => undefined,
): AuthSync {
  let stopped = false;
  // Each auth event gets a number; an answer that arrives for an older event is ignored.
  let latest = 0;

  async function resolveProfile(user: AuthUser, event: number): Promise<void> {
    try {
      const profile = await service.loadUserProfile(user);

      if (!stopped && event === latest) dispatch({ type: "profile-loaded", user, profile });
    } catch (error) {
      log("could not load the user profile", error);

      if (!stopped && event === latest) dispatch({ type: "profile-failed", user });
    }
  }

  const unsubscribe = service.subscribeToAuthState((user) => {
    latest += 1;

    if (!user) {
      dispatch({ type: "signed-out" });
      return;
    }

    dispatch({ type: "user-detected", user });
    void resolveProfile(user, latest);
  });

  return {
    stop() {
      stopped = true;
      unsubscribe();
    },
    reloadProfile(user) {
      latest += 1;
      dispatch({ type: "user-detected", user });

      return resolveProfile(user, latest);
    },
  };
}
