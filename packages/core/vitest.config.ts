import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      QUEUE_MODE: "inline",
      PROVIDER_MODE: "mock",
      STORAGE_MODE: "local",
    },
    envFilePath: [".env.test"],
  },
});
