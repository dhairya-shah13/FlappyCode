# FlappyCode Provider Verification Matrix (PROVIDERS.md)

*Last updated: 2026-09-29*

This matrix tracks endpoint specifications, authentication schemes, free-tier limits, discovery interfaces, and verified Terms of Service (ToS) data usage policies across all supported providers.

---

## Provider Comparison Matrix

| Provider | Type | Base URL | Auth Scheme | Free Tier Limits | Data Use (Trains) | Discovery | Tool Calls | Verified Date | Doc URL |
|---|---|---|---|---|---|---|---|---|---|
| **Anthropic** | `anthropic` | `https://api.anthropic.com/v1` | `x-api-key` | 5 RPM | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://docs.anthropic.com/en/api/getting-started) |
| **Google AI Studio** | `google` | `https://generativelanguage.googleapis.com/v1beta` | `bearer` | 15 RPM 1500 RPD | `yes` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://ai.google.dev/gemini-api/docs) |
| **GroqCloud** | `openai_compatible` | `https://api.groq.com/openai/v1` | `bearer` | 30 RPM 14400 RPD | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://console.groq.com/docs/quickstart) |
| **Kilocode** | `openai_compatible` | `https://api.kilocode.ai/v1` | `bearer` | 15 RPM | `unknown` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://kilocode.ai/docs) |
| **LM Studio (Local)** | `openai_compatible` | `http://localhost:1234/v1` | `none` | Unlimited Local | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://lmstudio.ai/docs/local-server) |
| **Ollama (Local)** | `openai_compatible` | `http://localhost:11434/v1` | `none` | Unlimited Local | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://github.com/ollama/ollama/blob/main/docs/openai.md) |
| **Ollama Cloud** | `openai_compatible` | `https://api.ollama.com/v1` | `bearer` | 20 RPM | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://ollama.com/docs) |
| **OpenAI** | `openai_compatible` | `https://api.openai.com/v1` | `bearer` | Paid Only | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://platform.openai.com/docs/api-reference) |
| **OpenRouter** | `openai_compatible` | `https://openrouter.ai/api/v1` | `bearer` | 20 RPM 200 RPD | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://openrouter.ai/docs) |
| **Together AI** | `openai_compatible` | `https://api.together.xyz/v1` | `bearer` | 10 RPM | `no` | Yes (/models) | Yes | 2026-09-29 | [Docs](https://docs.together.ai/docs/quickstart) |

---

## Data-Use & Training Transparency

FlappyCode displays clear data-use indicators in the TUI status bar and model picker:
- `trains_on_data: no`: Vendor ToS explicitly prohibits using API request and response data to train commercial models (e.g. Anthropic Commercial, OpenAI API, Groq, OpenRouter).
- `trains_on_data: yes`: Vendor terms permit training on free-tier requests (e.g. Google AI Studio Free Tier).
- `trains_on_data: opt_out`: User can opt out in vendor settings dashboard.
- `trains_on_data: unknown`: Terms are pending confirmation or ambiguous; FlappyCode defaults to notifying the user.

---

## NEEDS_HUMAN_VERIFICATION

The following providers require ongoing human legal verification or documentation confirmation:
- **Kilocode** (`kilocode`): ToS data usage clause requires human legal verification pending confirmation of training opt-out policy. Documented at [https://kilocode.ai/docs](https://kilocode.ai/docs).
