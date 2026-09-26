import { Redirect } from "expo-router";

import { PUSHED_EDGES, Screen } from "@/components/ui/Screen";
import { SecondaryButton } from "@/components/ui/SecondaryButton";
import { StateView } from "@/components/ui/StateView";
import { useAuth } from "@/context/AuthContext";

/** The front door: sends each visitor to the right place for their auth state and role. */
export default function Index() {
  const { status, role, retryProfile, signOut } = useAuth();

  if (status === "unauthenticated") {
    return <Redirect href="/(auth)/login" />;
  }

  if (status === "authenticated") {
    return (
      <Redirect
        href={role === "faculty" ? "/(faculty)/(tabs)/dashboard" : "/(student)/(tabs)/home"}
      />
    );
  }

  if (status === "profile-error") {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <StateView
          variant="error"
          title="We could not load your account"
          message="Check your connection and try again."
          onAction={retryProfile}
        />

        <SecondaryButton
          title="Sign out"
          icon="log-out-outline"
          onPress={() => {
            void signOut();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={PUSHED_EDGES}>
      <StateView variant="loading" message="Loading..." />
    </Screen>
  );
}
