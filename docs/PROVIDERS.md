# 🔌 Day-One Provider Setup Guide

FlappyCode unifies access to local inference engines and cloud model providers. All API keys are encrypted at rest using your operating system's native keychain (libsecret on Linux, Keychain on macOS, DPAPI/Credential Manager on Windows).

> [!WARNING]
> **Terms of Service (ToS) Caveat:** Each provider operates under its own legal Terms of Service and Data Use agreements. While FlappyCode categorizes and flags providers by data retention policy, you are responsible for reviewing and adhering to provider policies regarding codebase privacy and commercial use.

---

## 1. Data-Use Policies Explained

FlappyCode labels every provider with a data usage declaration:
- `no_training`: The provider explicitly states in their API policy that customer requests and codebase payloads are not used to train foundational AI models (e.g. enterprise terms, Anthropic API, paid OpenAI API, Groq commercial tier).
- `may_train`: The provider's free or public tier terms reserve the right to log queries or use anonymized prompts for model evaluation or training (e.g. Google AI Studio free tier).
- `usage_local`: Complete privacy. Model weights run entirely on your local CPU/GPU hardware. No prompts or code tokens ever leave your machine.

---

## 2. Local Providers (100% Offline, Zero-Cost)

### Ollama (Local)
- **Data Policy**: `usage_local`
- **Default Endpoint**: `http://127.0.0.1:11434`
- **How to Setup**:
  1. Install [Ollama](https://ollama.ai)
  2. Pull coding models: `ollama pull qwen2.5-coder:7b` or `ollama pull llama3.2`
  3. Start Ollama: `ollama serve`
  4. In FlappyCode: `flappycode providers add` → select `ollama`

### LM Studio
- **Data Policy**: `usage_local`
- **Default Endpoint**: `http://127.0.0.1:1234/v1`
- **How to Setup**:
  1. Download and start LM Studio
  2. Load any GGUF coding model (e.g. DeepSeek Coder, Qwen Coder)
  3. In Developer tab, start the local OpenAI-compatible server on port `1234`
  4. In FlappyCode: `flappycode providers add` → select `lmstudio`

### llama.cpp Server
- **Data Policy**: `usage_local`
- **Default Endpoint**: `http://127.0.0.1:8080/v1`
- **How to Setup**:
  1. Launch server: `./llama-server -m your-model.gguf --port 8080`
  2. In FlappyCode: `flappycode providers add` → select `llamacpp`

---

## 3. Cloud Providers with Free Tiers

### Groq
- **Free Tier**: Generous free rate-limited tier providing fast inference for Llama 3.3 70B, Llama 3.1 8B, and Mixtral.
- **Data Policy**: `no_training`
- **Key Location**: [https://console.groq.com/keys](https://console.groq.com/keys)
- **Setup**: `flappycode providers add` → select `groq` → enter `gsk_...`

### Google AI Studio (Gemini)
- **Free Tier**: Free tier quotas for Gemini 1.5 Flash and Gemini 1.5 Pro (rate-limited requests per minute).
- **Data Policy**: `may_train` (Free tier prompts may be reviewed by human annotators per Google terms; upgrade to paid API key for no-training enterprise terms).
- **Key Location**: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Setup**: `flappycode providers add` → select `google` → enter API key

### OpenRouter
- **Free Tier**: Multiple models ending in `:free` (e.g., `meta-llama/llama-3.2-3b-instruct:free`, `qwen/qwen-2.5-coder-32b-instruct:free`).
- **Data Policy**: Depends on upstream provider routing; marked `may_train` for `:free` endpoints.
- **Key Location**: [https://openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)
- **Setup**: `flappycode providers add` → select `openrouter` → enter `sk-or-v1-...`

### Together AI
- **Free Tier**: Offers initial trial credits and rate-limited developer endpoints.
- **Data Policy**: `no_training`
- **Key Location**: [https://api.together.ai/settings/api-keys](https://api.together.ai/settings/api-keys)
- **Setup**: `flappycode providers add` → select `together`

### Kilocode
- **Free Tier**: Community-sponsored free coding endpoints for high-throughput development.
- **Data Policy**: `no_training`
- **Setup**: `flappycode providers add` → select `kilocode`

### Ollama Cloud
- **Free Tier**: Hosted cloud instances of Ollama-served models.
- **Data Policy**: `no_training`
- **Setup**: `flappycode providers add` → select `ollama_cloud`

---

## 4. Paid / Commercial Providers (Pay-as-you-go)

FlappyCode requires explicit confirmation before any paid call is executed. Paid models are classified into the `paid` tier and are **never** called silently.

### Anthropic
- **Tier**: Paid (Claude 3.5 Sonnet, Claude 3.5 Haiku)
- **Data Policy**: `no_training`
- **Key Location**: [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **Setup**: `flappycode providers add` → select `anthropic` → enter `sk-ant-...`

### OpenAI
- **Tier**: Paid (GPT-4o, GPT-4o-mini, o1)
- **Data Policy**: `no_training` (Standard API platform policy)
- **Key Location**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Setup**: `flappycode providers add` → select `openai` → enter `sk-...`

---

## 5. Verification & Testing

Test connectivity and model discovery for all added providers:
```bash
# Test connectivity to a specific provider
flappycode providers test groq

# Refresh model catalogs
flappycode providers refresh

# List all discovered free models
flappycode models --free
```
