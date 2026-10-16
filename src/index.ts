import { Plugin } from "@opencode/plugin";
import { Schema } from "effect";
import { ConfigSchema } from "./config.js";

const serviceName = "opencode-adaptive-thinking";
const maxSessionStateSize = 500;

type SessionState = {
  persistedVariant?: string;
  temporaryResetVariant?: string;
};

type ModelRef = { id: string; providerID: string; variant?: string };

class SessionStateCache {
  private readonly entries = new Map<string, SessionState>();

  constructor(private readonly maxSize: number) {}

  get(sessionID: string) {
    const entry = this.entries.get(sessionID);
    if (!entry) return;

    // bump to most-recently-used
    this.entries.delete(sessionID);
    this.entries.set(sessionID, entry);
    return entry;
  }

  update(sessionID: string, update: (entry: SessionState) => void) {
    const entry = this.get(sessionID) ?? {};
    update(entry);
    this.entries.set(sessionID, entry);

    while (this.entries.size > this.maxSize) {
      const oldestSessionID = this.entries.keys().next().value;
      if (!oldestSessionID) break;
      this.entries.delete(oldestSessionID);
    }
  }
}

const state = new SessionStateCache(maxSessionStateSize);

export default Plugin.define({
  id: serviceName,
  setup: async (ctx) => {
    const configParseResult = ConfigSchema.safeParse(ctx.options);
    if (!configParseResult.success) {
      // v2 plugins have no logger or toast on the context; stderr is captured by opencode's logs.
      console.error(`[${serviceName}] invalid configuration: ${configParseResult.error.message}`);
      return;
    }

    const config = configParseResult.data;
    if (!config.enabled) return;

    // Valid reasoning-effort levels are the variant ids of the session's active model.
    const variantsForModel = async (model: ModelRef | undefined): Promise<string[]> => {
      if (!model) return [];
      const models = await ctx.model.list();
      const info = models.data.find((m) => m.providerID === model.providerID && m.id === model.id);
      return info?.variants?.map((v) => String(v.id)) ?? [];
    };

    const currentModel = async (sessionID: string): Promise<ModelRef | undefined> => {
      const info = await ctx.session.get({ sessionID });
      return info.model as ModelRef | undefined;
    };

    const setVariant = async (sessionID: string, model: ModelRef, variant: string) =>
      ctx.session.switchModel({
        sessionID,
        model: { id: model.id, providerID: model.providerID, variant },
      });

    // Tool: let the agent set its own reasoning effort by switching the session's model variant.
    await ctx.tool.transform((editor) => {
      editor.add({
        name: config.toolName,
        description: config.toolDescription,
        input: Schema.Struct({
          level: Schema.String,
          persist: Schema.optional(Schema.Boolean),
        }),
        execute: async ({ level, persist }, { sessionID }) => {
          const model = await currentModel(sessionID);
          const validVariants = await variantsForModel(model);
          if (!model || validVariants.length === 0) {
            return {
              content:
                "Failed to set reasoning effort: no reasoning effort levels are available for this session.",
            };
          }
          if (!validVariants.includes(level)) {
            return {
              content: `Invalid reasoning effort level: ${level}. Valid levels: ${validVariants.join(", ")}.`,
            };
          }

          const previousVariant = model.variant;
          await setVariant(sessionID, model, level);

          state.update(sessionID, (entry) => {
            if (persist) {
              entry.persistedVariant = level;
              delete entry.temporaryResetVariant;
            } else if (previousVariant && previousVariant !== level) {
              entry.temporaryResetVariant = previousVariant;
            } else {
              delete entry.temporaryResetVariant;
            }
          });

          return { content: `Reasoning effort set to ${level}.` };
        },
      });
    });

    // Inject guidance (and the live level list) into every model request's system prompt.
    ctx.session.hook("context", async (event) => {
      const validVariants = await variantsForModel(event.model as ModelRef);
      if (validVariants.length === 0) return;

      const variant = (event.model as ModelRef).variant;
      event.system.push({
        type: "text",
        text:
          config.systemPrompt.trim() +
          " " +
          (variant ? `Current reasoning effort level: ${variant}. ` : "") +
          `Valid reasoning effort levels for this session: ${validVariants.join(", ")}. ` +
          `To change your reasoning effort, use the \`${config.toolName}\` tool with one of the valid levels. ` +
          "Only call it when the task complexity justifies changing levels.",
      });
    });

    // On session idle, undo any temporary (non-persisted) reasoning-effort change.
    const abort = new AbortController();
    void (async () => {
      try {
        for await (const ev of ctx.event.subscribe({ signal: abort.signal })) {
          if (ev.type !== "session.idle") continue;

          const sessionID = ev.data.sessionID;
          const resetVariant = state.get(sessionID)?.temporaryResetVariant;
          if (!resetVariant) continue;

          const model = await currentModel(sessionID);
          if (!model) continue;

          await setVariant(sessionID, model, resetVariant);
          state.update(sessionID, (entry) => {
            delete entry.temporaryResetVariant;
          });
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error(`[${serviceName}] event subscription error: ${String(err)}`);
        }
      }
    })();

    return () => abort.abort();
  },
});
