import { defineConfig } from "vitest/config";

export default defineConfig({
  // Port is FIXED: measurement URLs in documentation point exactly to this address.
  // If port is busy, Vite errors out instead of shifting to another port.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: "esnext" },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
