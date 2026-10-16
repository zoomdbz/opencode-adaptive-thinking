import { describe, expect, test } from "vitest";
import plugin from "./index";

type SystemPart = { type: "text"; text: string };
type ContextEvent = {
  model: { id: string; providerID: string; variant?: string };
  system: SystemPart[];
  agent: string;
};
type ContextHandler = (event: ContextEvent) => Promise<void> | void;

// Minimal ctx mock: captures the "context" hook and stubs the domains setup touches.
function makeCtx(options: Record<string, unknown>) {
  let contextHandler: ContextHandler | undefined;
  const ctx = {
    options,
    model: {
      list: async () => ({
        data: [{ providerID: "p", id: "m", variants: [{ id: "low" }, { id: "high" }] }],
      }),
    },
    session: {
      get: async () => ({ model: { id: "m", providerID: "p", variant: "high" } }),
      switchModel: async () => {},
      hook: (name: string, handler: ContextHandler) => {
        if (name === "context") contextHandler = handler;
        return { dispose: async () => {} };
      },
    },
    tool: {
      transform: async (cb: (editor: { add: () => void }) => void) => {
        cb({ add: () => {} });
      },
    },
    // Never-yielding subscription so the idle loop exits immediately in tests.
    event: {
      subscribe: () =>
        (async function* () {
          /* no events */
        })(),
    },
  };
  return {
    ctx,
    getContextHandler: () => contextHandler,
  };
}

describe("opencode-adaptive-thinking (v2)", () => {
  test("exports a v2 plugin definition", () => {
    expect(plugin.id).toBe("opencode-adaptive-thinking");
    expect(typeof plugin.setup).toBe("function");
  });

  test("setup is a no-op when disabled", async () => {
    const cleanup = await plugin.setup({ options: { enabled: false } } as never);
    expect(cleanup).toBeUndefined();
  });

  test("merges adaptive guidance into an existing system prompt (single system message)", async () => {
    const { ctx, getContextHandler } = makeCtx({});
    await plugin.setup(ctx as never);
    const handler = getContextHandler();
    expect(handler).toBeDefined();

    const existing = "You are a helpful coding assistant.";
    const system: SystemPart[] = [{ type: "text", text: existing }];
    await handler!({
      model: { id: "m", providerID: "p", variant: "high" },
      system,
      agent: "build",
    });

    expect(system).toHaveLength(1);
    expect(system[0]!.text).toContain(existing);
    expect(system[0]!.text).toContain(`${existing}\n\n`);
    expect(system[0]!.text).toContain("You MUST manage reasoning effort actively");
    expect(system[0]!.text).toContain("set_reasoning_effort");
    expect(system[0]!.text).toContain("Current reasoning effort level: high.");
  });

  test("injects a standalone part when no system prompt exists", async () => {
    const { ctx, getContextHandler } = makeCtx({});
    await plugin.setup(ctx as never);
    const handler = getContextHandler();
    expect(handler).toBeDefined();

    const system: SystemPart[] = [];
    await handler!({
      model: { id: "m", providerID: "p", variant: "high" },
      system,
      agent: "build",
    });

    expect(system).toHaveLength(1);
    expect(system[0]!.text).toContain("You MUST manage reasoning effort actively");
    expect(system[0]!.text).toContain("set_reasoning_effort");
  });
});
