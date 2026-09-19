import { useState } from "react";
import { Text, View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../api";

export function SignInScreen({ onAuthenticated }: { onAuthenticated: (access: string, refresh: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session =
        mode === "signin"
          ? await api.signIn({ email, password })
          : await api.signUp({ email, password, displayName: name || email.split("@")[0] });
      onAuthenticated(session.accessToken, session.refreshToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.brand}>RenderVid</Text>
      <Text style={styles.tagline}>Create anything. Without knowing how.</Text>

      {mode === "signup" && (
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor="#8a8a94"
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="you@studio.com"
        placeholderTextColor="#8a8a94"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#8a8a94"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.primary} onPress={submit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#0a0a0b" />
        ) : (
          <Text style={styles.primaryText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.switchText} onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0a0b", justifyContent: "center", padding: 28 },
  brand: { color: "#fff", fontSize: 32, fontWeight: "700", textAlign: "center" },
  tagline: { color: "#8a8a94", textAlign: "center", marginTop: 6, marginBottom: 40 },
  input: {
    backgroundColor: "#17171a",
    borderColor: "#2a2a30",
    borderWidth: 1,
    borderRadius: 12,
    color: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  primary: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 6 },
  primaryText: { color: "#0a0a0b", fontWeight: "700", fontSize: 16 },
  error: { color: "#f87171", marginBottom: 10, marginTop: 4 },
  switchText: { color: "#8a8a94", textAlign: "center", marginTop: 24 },
});
