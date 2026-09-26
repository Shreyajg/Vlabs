import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { PUSHED_EDGES, Screen } from "@/components/ui/Screen";
import { StateView } from "@/components/ui/StateView";
import { AuthProvider, useAuth } from "@/context/AuthContext";

function RootNavigator() {
  const { initialized, status, role } = useAuth();

  // Do not mount any route until Firebase has said who is signed in. Mounting later, with the
  // right guards already in place, also lets a page refresh land back on the same screen.
  if (!initialized) {
    return (
      <Screen scroll={false} edges={PUSHED_EDGES}>
        <StateView variant="loading" message="Loading..." />
      </Screen>
    );
  }

  const signedIn = status === "authenticated";

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Login and registration: only while signed out. */}
      <Stack.Protected guard={status === "unauthenticated"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      {/* Each area is reachable only by the role in the user's profile. */}
      <Stack.Protected guard={signedIn && role === "student"}>
        <Stack.Screen name="(student)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && role === "faculty"}>
        <Stack.Screen name="(faculty)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>

      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
