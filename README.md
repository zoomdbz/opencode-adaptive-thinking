<div align='center'>
    <br/>
    <br/>
    <h3>opencode-adaptive-thinking</h3>
    <p>Adaptive Thinking Plugin for OpenCode.</p>
    <a href="https://www.npmjs.com/package/opencode-adaptive-thinking"><img src="https://img.shields.io/npm/v/opencode-adaptive-thinking?style=for-the-badge&logo=npm&label=npm&color=cb3837" alt="npm version" /></a>
    <br/>
    <br/>
</div>

## Overview

`opencode-adaptive-thinking` is an OpenCode plugin that lets agents actively adjust model reasoning effort during a session.

The plugin injects adaptive-thinking guidance into the system prompt and exposes a tool for switching to one of the current model's valid reasoning-effort variants.

## This fork

Fork of [ian-pascoe/opencode-adaptive-thinking](https://github.com/ian-pascoe/opencode-adaptive-thinking) with two fixes over the original:

- **Updated for the opencode 2 plugin API.** opencode 2 rewrote the plugin contract (a `Plugin.define({ id, setup })` default export built against `@opencode/plugin@2`). The original targets opencode 1 (`@opencode-ai/plugin ^1`) and fails to load on opencode 2. Reasoning effort is now applied with `session.switchModel` (the model variant) instead of the old synthetic-prompt mechanism.
- **Single system message.** The original added its guidance as a _second_ system message. Strict chat templates (common with local GGUF models) allow only one system message at the start of the conversation and reject any later one, which broke the plugin. This fork merges the guidance into your existing first system prompt, and only adds a standalone one when there is no system prompt yet.

## Requirements

- opencode 2 (plugin API `@opencode/plugin` `^2`).
- A selected model that exposes reasoning-effort variants such as `none`, `low`, `medium`, `high`, or `xhigh`.

## Installation

Build the plugin, then point your opencode config at the built package directory (opencode 2 loads a local plugin from its package directory, reading `package.json` `main`):

```bash
pnpm install && pnpm build
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/opencode-adaptive-thinking"]
}
```

To customize behavior, use the tuple form shown in the configuration example below (replace the package name with the same absolute path).

## Configuration

The plugin accepts these optional settings:

- `enabled`: enable or disable the plugin without removing it from config. Defaults to `true`.
- `quiet`: reserved flag carried over from the original (opencode 2 plugins have no toast API; configuration errors are written to the opencode logs). Defaults to `false`.
- `toolName`: name of the reasoning-effort tool exposed to agents. Defaults to `set_reasoning_effort`.
- `toolDescription`: description for the reasoning-effort tool. Defaults to `Set your reasoning effort`.
- `systemPrompt`: custom adaptive-thinking guidance injected into the system prompt.

### Example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-adaptive-thinking",
      {
        "enabled": true,
        "quiet": false,
        "toolName": "set_reasoning_effort",
        "toolDescription": "Set your reasoning effort",
        "systemPrompt": "Actively choose the lowest reasoning effort that can safely complete the task. Raise effort for ambiguity, debugging, risky changes, or multi-step synthesis."
      }
    ]
  ]
}
```

## Behavior

Agents receive system guidance to actively choose the lowest reasoning effort that can safely complete the task. The plugin also exposes the configured tool, `set_reasoning_effort` by default, with these arguments:

- `level`: one of the valid reasoning-effort variants for the current model.
- `persist`: when `true`, keep the selected effort for the session. When `false` or omitted, apply it temporarily and reset to the previous effort after `session.idle`.

Example temporary change:

```json
{
  "level": "high",
  "persist": false
}
```

Example persisted change:

```json
{
  "level": "low",
  "persist": true
}
```

The system prompt lists the valid levels for the current session. Cached session state is only used when it is still valid for the current model, so switching models will not advertise or reuse an invalid effort level.

Guidance is merged into your existing first system prompt as a single leading system message rather than appended as a second one, so it works with strict chat templates (e.g. local GGUF models) that permit only one system message.

## Troubleshooting

If the tool returns `no valid reasoning effort levels are available for this session`, check that the active model exposes variants in OpenCode. Some providers or models may not support reasoning-effort levels.

If the tool returns `Invalid reasoning effort level`, use one of the levels listed in the system prompt for the current session.

If configuration errors appear, check the plugin options against the documented keys and value types. Details are written to the OpenCode logs (opencode 2 plugins have no toast UI).

## Development

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```
