import { defineConfig } from "vite";

// No react plugin: esbuild's automatic JSX runtime is all a static dashboard
// needs, and it keeps the dependency tree small enough to build anywhere.
export default defineConfig({
  base: "./",
  esbuild: {
    jsx: "automatic",
  },
});
