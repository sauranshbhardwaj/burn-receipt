import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  // The workspace core package is bundled in; real npm deps stay external.
  noExternal: ["@burn-receipt/core"],
  async onSuccess() {
    await cp("../../packages/core/assets/fonts", "dist/fonts", { recursive: true });
  },
});
