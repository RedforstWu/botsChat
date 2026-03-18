import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  // Bundle e2e-crypto (private workspace pkg) into the output
  noExternal: ["e2e-crypto"],
  // Keep commander and ws as external (user installs them)
  external: ["commander", "ws"],
});
