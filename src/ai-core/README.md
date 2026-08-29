# AYROVI AI Core — Phase 1

This directory owns provider-neutral AI contracts and provider registration.

Phase 1 routing is deliberately behavior-preserving:

- Active Responses provider: `AnthropicAdapter`.
- Target Responses provider: `OpenAIResponsesAdapter` (registered, not routed).
- Target realtime provider: `OpenAIRealtimeAdapter` (session creation disabled).
- Existing voice subsystem: represented by `LegacyVoiceAdapter`; routes unchanged.

No environment variable can silently promote OpenAI in this phase. Shadow and
Canary routing require later reviewed phases.

Provider SDK/wire types must not leave `adapters/`. Business tools execute only
through a server-owned Tool Gateway.
