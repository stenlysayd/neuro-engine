import { BrainAdapter, ChatInput, ChatOutput, ApiKey } from '@neuro/core';

function credential(apiKey: ApiKey) {
  return apiKey.secret || apiKey.key_encrypted;
}

async function providerError(provider: string, response: Response) {
  let detail = response.statusText;
  try {
    const body = await response.text();
    if (body) {
      detail = body.slice(0, 500);
    }
  } catch {
    // Keep status text.
  }

  const err = new Error(`${provider} error ${response.status}: ${detail}`) as any;
  err.status = response.status;
  err.headers = Object.fromEntries(response.headers.entries());
  return err;
}

export class OpenAIAdapter implements BrainAdapter {
  provider = 'openai';

  async chat(input: ChatInput, apiKey: ApiKey): Promise<ChatOutput> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credential(apiKey)}`
      },
      body: JSON.stringify({
        model: input.model || 'gpt-4o-mini',
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 1024
      })
    });

    if (!response.ok) {
      throw await providerError('OpenAI', response);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }
    };
  }

  countTokens(input: ChatInput): number {
    return Math.ceil(JSON.stringify(input.messages).length / 4);
  }
}

export class AnthropicAdapter implements BrainAdapter {
  provider = 'anthropic';

  async chat(input: ChatInput, apiKey: ApiKey): Promise<ChatOutput> {
    // Convert generic system/user roles to Anthropic's expected format if needed
    const systemMessage = input.messages.find(m => m.role === 'system')?.content;
    const userMessages = input.messages.filter(m => m.role !== 'system');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': credential(apiKey),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: input.model || 'claude-3-haiku-20240307',
        system: systemMessage,
        messages: userMessages,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.7
      })
    });

    if (!response.ok) {
      throw await providerError('Anthropic', response);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      }
    };
  }

  countTokens(input: ChatInput): number {
    return Math.ceil(JSON.stringify(input.messages).length / 4);
  }
}

export class GroqAdapter implements BrainAdapter {
  provider = 'groq';

  async chat(input: ChatInput, apiKey: ApiKey): Promise<ChatOutput> {
    // Groq is fully OpenAI compatible
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credential(apiKey)}`
      },
      body: JSON.stringify({
        model: input.model || 'llama-3.1-8b-instant',
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 1024
      })
    });

    if (!response.ok) {
      throw await providerError('Groq', response);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  }

  countTokens(input: ChatInput): number {
    return Math.ceil(JSON.stringify(input.messages).length / 4);
  }
}

export class LocalAdapter implements BrainAdapter {
  provider = 'local';

  async chat(input: ChatInput, apiKey: ApiKey): Promise<ChatOutput> {
    // Local API assumption (e.g. Ollama)
    // apiKey.key_encrypted can hold the base URL if needed, or we just hardcode localhost
    const keyValue = credential(apiKey);
    const baseUrl = keyValue.startsWith('http') ? keyValue : 'http://localhost:11434';
    
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: input.model || 'llama3',
        messages: input.messages,
        stream: false
      })
    });

    if (!response.ok) {
      throw await providerError('Local LLM', response);
    }

    const data = await response.json();
    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      }
    };
  }

  countTokens(input: ChatInput): number {
    return Math.ceil(JSON.stringify(input.messages).length / 4);
  }
}



export class GoogleAdapter implements BrainAdapter {
  provider = 'google';

  async chat(input: ChatInput, apiKey: ApiKey): Promise<ChatOutput> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model || 'gemini-1.5-flash'}:generateContent?key=${credential(apiKey)}`;
    
    const systemInstruction = input.messages.find(m => m.role === 'system')?.content;
    const contents = input.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: {
          temperature: input.temperature ?? 0.7,
          maxOutputTokens: input.maxTokens ?? 1024
        }
      })
    });

    if (!response.ok) {
      throw await providerError('Google', response);
    }

    const data = await response.json();
    return {
      content: data.candidates[0].content.parts[0].text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0
      }
    };
  }

  countTokens(input: ChatInput): number {
    return Math.ceil(JSON.stringify(input.messages).length / 4);
  }
}
