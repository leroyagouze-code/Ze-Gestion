import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", setupFiles: ["dotenv/config"], fileParallelism: false, testTimeout: 20000, exclude: ["**/node_modules/**", "ze-loyer/**"] },
});
