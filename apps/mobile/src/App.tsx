/**
 * RenderVid iOS app (Expo). Auth gate + Create / Library / Credits tabs.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Text, View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { api, persistToken, clearToken, useAuthStore } from "./api";
import { SignInScreen } from "./screens/SignInScreen";
import { CreateScreen } from "./screens/CreateScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { CreditsScreen } from "./screens/CreditsScreen";

function useAuthState(): { token: string | null; ready: boolean } {
  const token = useSyncExternalStore(
    (cb) => useAuthStore.subscribe(cb),
    () => useAuthStore.getSnapshot(),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .getWallet()
      .then(() => useAuthStore.setToken("session"))
      .catch(() => useAuthStore.setToken(null))
      .finally(() => setReady(true));
  }, []);

  return { token, ready };
}

export default function App() {
  const { ready } = useAuthState();

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <StatusBar style="light" />
      </View>
    );
  }

  return <Root />;
}

function Root() {
  const { token } = useAuthState();

  if (!token) {
    return (
      <>
        <SignInScreen
          onAuthenticated={async (accessToken, refreshToken) => {
            await persistToken(accessToken, refreshToken);
            useAuthStore.setToken("session");
          }}
        />
        <StatusBar style="light" />
      </>
    );
  }

  return <MainTabs />;
}

function MainTabs() {
  const [tab, setTab] = useState<"create" | "library" | "credits">("create");

  return (
    <View style={styles.app}>
      {tab === "create" && <CreateScreen api={api} />}
      {tab === "library" && <LibraryScreen api={api} />}
      {tab === "credits" && (
        <CreditsScreen
          api={api}
          onSignOut={async () => {
            await clearToken();
            useAuthStore.setToken(null);
          }}
        />
      )}
      <TabBar tab={tab} onChange={setTab} />
    </View>
  );
}

function TabBar({
  tab,
  onChange,
}: {
  tab: "create" | "library" | "credits";
  onChange: (t: "create" | "library" | "credits") => void;
}) {
  const items = [
    { id: "create", label: "Create" },
    { id: "library", label: "Library" },
    { id: "credits", label: "Credits" },
  ] as const;

  return (
    <View style={styles.tabbar}>
      {items.map((i) => (
        <Text
          key={i.id}
          onPress={() => onChange(i.id)}
          style={[styles.tabItem, tab === i.id && styles.tabActive]}
        >
          {i.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a0b" },
  app: { flex: 1, backgroundColor: "#0a0a0b" },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2a2a30",
    backgroundColor: "#111113",
    paddingBottom: 24,
    paddingTop: 10,
  },
  tabItem: { flex: 1, textAlign: "center", color: "#8a8a94", fontSize: 13 },
  tabActive: { color: "#ffffff", fontWeight: "600" },
});
