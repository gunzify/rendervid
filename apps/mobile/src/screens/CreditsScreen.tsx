import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import type { ApiClient } from "@rendervid/shared/client";
import type { TransactionListResponse, WalletDto } from "@rendervid/shared";

export function CreditsScreen({ api, onSignOut }: { api: ApiClient; onSignOut: () => void }) {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [history, setHistory] = useState<TransactionListResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([api.getWallet(), api.getTransactions()]);
      setWallet(w);
      setHistory(t);
    } catch {
      /* keep last state */
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#8a8a94" />}
    >
      <Text style={styles.title}>Credits</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available</Text>
        <Text style={styles.balanceValue}>{(wallet?.availableCredits ?? 0).toLocaleString()}</Text>
        <Text style={styles.balanceSub}>
          {(wallet?.paidCredits ?? 0).toLocaleString()} paid · {(wallet?.bonusCredits ?? 0).toLocaleString()} bonus
        </Text>
      </View>

      <Text style={styles.section}>History</Text>
      <View style={styles.list}>
        {(history?.items.length ?? 0) === 0 && <Text style={styles.empty}>No transactions yet.</Text>}
        {history?.items.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t.description}</Text>
              <Text style={styles.rowDate}>{new Date(t.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={[styles.rowAmount, t.amount > 0 && styles.amountPositive]}>
              {t.amount > 0 ? "+" : ""}
              {t.amount !== 0 ? t.amount : "—"}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.signOut} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
      <Text style={styles.note}>Credit purchases happen on the web — this keeps your iOS subscription simple.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0a0b" },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 16 },
  balanceCard: { backgroundColor: "#111113", borderRadius: 16, borderWidth: 1, borderColor: "#2a2a30", padding: 20 },
  balanceLabel: { color: "#8a8a94", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  balanceValue: { color: "#fff", fontSize: 36, fontWeight: "700", marginTop: 6 },
  balanceSub: { color: "#8a8a94", marginTop: 6 },
  section: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 28, marginBottom: 10 },
  list: { borderRadius: 16, borderWidth: 1, borderColor: "#2a2a30", backgroundColor: "#111113" },
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2a2a30" },
  rowTitle: { color: "#fff", fontSize: 14 },
  rowDate: { color: "#8a8a94", fontSize: 12, marginTop: 2 },
  rowAmount: { color: "#fff", fontWeight: "600" },
  amountPositive: { color: "#4ade80" },
  empty: { color: "#8a8a94", padding: 16 },
  signOut: { marginTop: 28, borderRadius: 12, borderWidth: 1, borderColor: "#2a2a30", paddingVertical: 13, alignItems: "center" },
  signOutText: { color: "#c9c9d1" },
  note: { color: "#8a8a94", fontSize: 12, textAlign: "center", marginTop: 16 },
});
