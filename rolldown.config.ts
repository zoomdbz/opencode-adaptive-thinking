import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
  },
  platform: "node",
  // effect and @opencode/plugin are provided by the opencode host at runtime and must not be
  // bundled (two copies of effect do not share fibers/loggers/Schema). zod is the plugin's own
  // dependency, resolved from node_modules.
  external: [/^effect(\/|$)/, /^@opencode\/plugin(\/|$)/, /^zod(\/|$)/],
});
