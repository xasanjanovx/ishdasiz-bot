/** Server-side Vertex AI express-mode transport shared by every Gemini feature. */
export class VertexAIError extends Error {
  constructor(public readonly kind: 'configuration' | 'billing' | 'unavailable' | 'invalid', public readonly status = 0) {
    super(`Vertex AI ${kind}`); this.name = 'VertexAIError';
  }
}

export function vertexConfigured(): boolean {
  return Boolean((process.env.GOOGLE_CLOUD_API_KEY || process.env.gemini_cloud_api)?.trim());
}

type Options = {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: 'application/json' | 'text/plain';
  systemInstruction?: string;
};

export async function generateVertexText(prompt: string, options: Options = {}): Promise<string> {
  // gemini_cloud_api accepts the name already used in the owner's local .env.
  const key = (process.env.GOOGLE_CLOUD_API_KEY || process.env.gemini_cloud_api)?.trim();
  const model = options.model || process.env.VERTEX_MODEL || 'gemini-2.5-flash';
  if (!key || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new VertexAIError('configuration');
  let response: Response;
  try {
    response = await fetch(`https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxOutputTokens ?? 2000,
          temperature: options.temperature ?? 0.2,
          ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
          // Small response budgets must not be consumed by hidden thinking.
          ...(model.startsWith('gemini-2.5-') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });
  } catch { throw new VertexAIError('unavailable'); }
  if (!response.ok) throw new VertexAIError([401, 403].includes(response.status) ? 'configuration' : [402, 429].includes(response.status) ? 'billing' : 'unavailable', response.status);
  try {
    const body = await response.json();
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('Incomplete response');
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) throw new Error('Missing content');
    const text = parts.filter(part => part.thought !== true && typeof part.text === 'string').map(part => part.text).join('').trim();
    if (!text) throw new Error('Empty content');
    return text;
  } catch { throw new VertexAIError('invalid'); }
}
