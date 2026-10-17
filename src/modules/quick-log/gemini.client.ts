import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { GeminiRequest } from './gemini.request';

/** Thin port over the SDK so the parser can be tested without the network. */
export interface GeminiClientPort {
  /** Resolves with the parsed JSON the model returned; rejects on any failure. */
  generateJson(request: GeminiRequest): Promise<unknown>;
}

export interface GeminiUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

export class GeminiClient implements GeminiClientPort {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly onUsage?: (usage: GeminiUsage) => void,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateJson(request: GeminiRequest): Promise<unknown> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        temperature: 0,
        responseMimeType: 'application/json',
        responseJsonSchema: request.schema,
        abortSignal: AbortSignal.timeout(this.timeoutMs),
        // The task is trivial; thinking tokens only add latency.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const usage = response.usageMetadata;
    if (usage) {
      this.onUsage?.({
        promptTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
        thoughtTokens: usage.thoughtsTokenCount ?? 0,
      });
    }

    if (!response.text) throw new Error('Gemini returned no text');
    return JSON.parse(response.text) as unknown;
  }
}
