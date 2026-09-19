import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
} from "react-native";
import type { ApiClient } from "@rendervid/shared/client";
import type { EstimateResponse, GenerationDto } from "@rendervid/shared";

const MODES = [
  { id: "auto", label: "Auto" },
  { id: "quality", label: "Quality" },
  { id: "economy", label: "Economy" },
] as const;

export function CreateScreen({ api }: { api: ApiClient }) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"auto" | "quality" | "economy">("auto");
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [generation, setGeneration] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshEstimate = useCallback(async () => {
    if (prompt.trim().length < 3) {
      setEstimate(null);
      return;
    }
    try {
      setEstimate(await api.estimate({ prompt, mode, assetIds: [] }));
    } catch {
      /* silent; estimate is best-effort */
    }
  }, [api, prompt, mode]);

  useEffect(() => {
    const t = setTimeout(refreshEstimate, 700);
    return () => clearTimeout(t);
  }, [refreshEstimate]);

  useEffect(() => {
    if (!generation || ["succeeded", "failed", "refunded", "canceled"].includes(generation.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        setGeneration(await api.getGeneration(generation.id));
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [api, generation]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.createGeneration({
        prompt,
        mode,
        projectId: null,
        assetIds: [],
        idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setGeneration({
        id: res.generationId,
        status: res.status,
        stage: "understanding",
        progress: 5,
        prompt,
        mode,
        contentType: estimate?.contentType ?? "Creation",
        quality: estimate?.quality ?? "high",
        durationSeconds: estimate?.durationSeconds ?? null,
        aspectRatio: estimate?.aspectRatio ?? null,
        reservedCredits: res.reservedCredits,
        chargedCredits: null,
        refundedCredits: null,
        assets: [],
        failureMessage: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the creation");
    } finally {
      setBusy(false);
    }
  }

  const done = generation?.status === "succeeded";
  const failed = generation ? ["failed", "refunded", "canceled"].includes(generation.status) : false;
  const active = generation !== null && generation !== undefined && !done && !failed;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={refreshEstimate} tintColor="#8a8a94" />}
    >
      <Text style={styles.title}>What do you want to create?</Text>

      <TextInput
        style={styles.input}
        multiline
        placeholder="Describe your creation…"
        placeholderTextColor="#8a8a94"
        value={prompt}
        onChangeText={setPrompt}
      />

      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.modeBtn, mode === m.id && styles.modeActive]}
            onPress={() => setMode(m.id)}
          >
            <Text style={[styles.modeText, mode === m.id && styles.modeTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.estimateRow}>
        <Text style={styles.estimateText}>
          {estimate
            ? `≈ ${estimate.estimatedCredits} credits · ${estimate.contentType}`
            : "Start typing to see your estimate"}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.createBtn, (!estimate?.affordable || busy || prompt.trim().length < 3) && { opacity: 0.4 }]}
        disabled={!estimate?.affordable || busy || prompt.trim().length < 3}
        onPress={create}
      >
        {busy ? <ActivityIndicator color="#0a0a0b" /> : <Text style={styles.createText}>Create</Text>}
      </TouchableOpacity>

      {active && generation && (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Creating your {generation.contentType.toLowerCase()}…</Text>
          {["understanding", "building", "generating", "finalizing"].map((s, i) => {
            const order = ["understanding", "building", "generating", "finalizing"];
            const current = order.indexOf(generation.stage);
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <Text key={s} style={[styles.step, state === "done" && styles.stepDone, state === "active" && styles.stepActive]}>
                {state === "done" ? "✓" : "○"} {s[0]!.toUpperCase() + s.slice(1)}
              </Text>
            );
          })}
        </View>
      )}

      {done && generation && generation.assets.length > 0 && (
        <View style={styles.resultCard}>
          {generation.assets.map((a) =>
            a.type === "video" ? (
              <Text key={a.id} style={styles.videoNote}>
                🎬 Video ready — open the web studio or tap below to download.
              </Text>
            ) : (
              <Image key={a.id} source={{ uri: a.url }} style={styles.resultImage} resizeMode="cover" />
            ),
          )}
          <TouchableOpacity style={styles.downloadBtn} onPress={() => Linking.openURL(generation.assets[0]!.url)}>
            <Text style={styles.downloadText}>Download</Text>
          </TouchableOpacity>
        </View>
      )}

      {failed && generation && (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{generation.failureMessage ?? "We couldn't complete that."}</Text>
          {generation.refundedCredits ? (
            <Text style={styles.stepDone}>Your {generation.refundedCredits} credits have been returned.</Text>
          ) : null}
          <TouchableOpacity style={styles.downloadBtn} onPress={() => setGeneration(null)}>
            <Text style={styles.downloadText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0a0b" },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 16 },
  input: {
    backgroundColor: "#17171a",
    borderColor: "#2a2a30",
    borderWidth: 1,
    borderRadius: 14,
    color: "#fff",
    padding: 16,
    minHeight: 110,
    fontSize: 16,
    textAlignVertical: "top",
  },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2a2a30",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#111113",
  },
  modeActive: { borderColor: "#fff" },
  modeText: { color: "#8a8a94", fontSize: 14 },
  modeTextActive: { color: "#fff", fontWeight: "600" },
  estimateRow: { marginTop: 12 },
  estimateText: { color: "#c9c9d1", fontSize: 14 },
  error: { color: "#f87171", marginTop: 10 },
  createBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 14 },
  createText: { color: "#0a0a0b", fontWeight: "700", fontSize: 16 },
  progressCard: { marginTop: 20, borderRadius: 14, borderWidth: 1, borderColor: "#2a2a30", backgroundColor: "#111113", padding: 16 },
  progressTitle: { color: "#fff", fontWeight: "600", marginBottom: 8 },
  step: { color: "#8a8a94", marginTop: 6 },
  stepDone: { color: "#4ade80" },
  stepActive: { color: "#fff" },
  resultCard: { marginTop: 20, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#2a2a30", backgroundColor: "#111113" },
  resultImage: { width: "100%", height: 260 },
  videoNote: { color: "#c9c9d1", padding: 16 },
  downloadBtn: { backgroundColor: "#fff", margin: 12, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  downloadText: { color: "#0a0a0b", fontWeight: "700" },
});
