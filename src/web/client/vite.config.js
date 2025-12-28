import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), preact()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: mode === "production",
    sourcemap: mode !== "production",
  },
}));
