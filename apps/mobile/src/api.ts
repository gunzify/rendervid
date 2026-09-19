/**
 * Mobile API client. Reuses the exact same typed client as web (@rendervid/shared),
 * backed by expo-secure-store token persistence.
 */
import { ApiClient } from "@rendervid/shared/client";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "rv.access";

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

let tokenCache: string | null = null;

export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  getToken: async () => {
    if (tokenCache) return tokenCache;
    tokenCache = (await SecureStore.getItemAsync(TOKEN_KEY)) ?? null;
    return tokenCache;
  },
  onUnauthorized: async () => {
    tokenCache = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    // Root navigator reacts to the auth state change.
    useAuthStore.setToken(null);
  },
});

export async function persistToken(accessToken: string, _refreshToken: string): Promise<void> {
  tokenCache = accessToken;
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
}

export async function clearToken(): Promise<void> {
  tokenCache = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/* Tiny store to trigger re-renders on auth changes (no external dep). */
type Listener = () => void;

class AuthStore {
  private token: string | null = null;
  private listeners = new Set<Listener>();

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getSnapshot() {
    return this.token;
  }

  setToken(t: string | null) {
    this.token = t;
    this.listeners.forEach((l) => l());
  }
}

export const useAuthStore = new AuthStore();
