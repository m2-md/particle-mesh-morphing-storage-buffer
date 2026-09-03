import { defineConfig } from "vitest/config";

export default defineConfig({
  // Port SABİT: README'deki ölçüm URL'leri birebir bu adresi gösteriyor.
  // Port doluysa Vite bir üstüne kaymak yerine hata verir.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: "esnext" },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
