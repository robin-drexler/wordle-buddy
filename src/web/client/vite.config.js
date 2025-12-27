import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig(({ mode }) => ({
  plugins: [preact()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: mode === "production",
    sourcemap: mode !== "production",
  },
}));
