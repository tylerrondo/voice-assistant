# @voice/platform-runtime

Production-facing entry point for the generic dialogue runtime maintained in this repository.

Exports:
- `DialogueStateManager` — isolated multi-turn contexts, slot state, confirmation gate and exactly-once execution records.
- `VoiceChannel` — declarative intent/slot resolution and scenario execution.

This package is a build boundary only. The implementation remains in `src/platform/*`; it does not fork or duplicate it. Domain behaviour is supplied as a ScenarioSet and an ActionDispatcher by the host application.

Build from the repository root:

```sh
npm run build:platform-runtime
```

Browser transport providers remain in `packages/voice` and are exposed from the repository root as `voice-assistant/voice/browser` and `voice-assistant/voice/channel`.
