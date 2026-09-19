import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Text,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Linking,
} from "react-native";
import type { ApiClient } from "@rendervid/shared/client";
import type { AssetDto } from "@rendervid/shared";

export function LibraryScreen({ api }: { api: ApiClient }) {
  const [assets, setAssets] = useState<AssetDto[] | null>(null);

  const load = useCallback(async () => {
    try {
      setAssets(await api.listAssets());
    } catch {
      setAssets([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      data={assets ?? []}
      keyExtractor={(a) => a.id}
      numColumns={2}
      refreshControl={<RefreshControl refreshing={assets === null} onRefresh={load} tintColor="#8a8a94" />}
      ListHeaderComponent={<Text style={styles.title}>Library</Text>}
      ListEmptyComponent={<Text style={styles.empty}>Your creative workspace is empty.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.cell}
          onPress={() => Linking.openURL(item.url)}
        >
          {item.type === "video" ? (
            <View style={[styles.thumb, styles.videoThumb]}>
              <Text style={styles.videoIcon}>▶</Text>
            </View>
          ) : (
            <Image source={{ uri: item.url }} style={styles.thumb} resizeMode="cover" />
          )}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0a0b" },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 16 },
  empty: { color: "#8a8a94", textAlign: "center", marginTop: 60 },
  cell: { flex: 1, margin: 4, aspectRatio: 1, borderRadius: 14, overflow: "hidden", backgroundColor: "#17171a" },
  thumb: { width: "100%", height: "100%" },
  videoThumb: { alignItems: "center", justifyContent: "center" },
  videoIcon: { color: "#fff", fontSize: 28 },
});
