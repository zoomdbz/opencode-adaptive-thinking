import { describe, expect, test } from "vitest";
import plugin from "./index";

describe("opencode-adaptive-thinking (v2)", () => {
  test("exports a v2 plugin definition", () => {
    expect(plugin.id).toBe("opencode-adaptive-thinking");
    expect(typeof plugin.setup).toBe("function");
  });

  test("setup is a no-op when disabled", async () => {
    // A disabled config must not touch any ctx domain; passing an empty ctx proves it returns early.
    const cleanup = await plugin.setup({ options: { enabled: false } } as never);
    expect(cleanup).toBeUndefined();
  });
});
