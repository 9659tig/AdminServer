import { ZodTypeAny } from 'zod';
import { ModelPolicy, ModelPolicyName } from './modelPolicy';

export interface LlmTextRequest {
    policy: ModelPolicyName;
    userPrompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxOutputTokens?: number;
}

export interface LlmGeneratedText {
    policy: ModelPolicyName;
    model: string;
    text: string;
}

export interface LlmObjectRequest<TSchema extends ZodTypeAny> extends LlmTextRequest {
    schema: TSchema;
}

export interface LlmGeneratedObject<T> extends LlmGeneratedText {
    object: T;
}

export interface LlmTranscriptionRequest {
    policy: ModelPolicyName;
    file: unknown;
    prompt?: string;
    language?: string;
    temperature?: number;
}

export interface LlmGeneratedTranscription {
    policy: ModelPolicyName;
    model: string;
    text: string;
}

export interface ModelPolicyRegistry {
    resolve(name: ModelPolicyName): ModelPolicy;
    list(): ModelPolicy[];
}

export interface OpenAIChatCompletionChoiceLike {
    message?: {
        content?: unknown;
    };
}

export interface OpenAIChatCompletionLike {
    choices?: OpenAIChatCompletionChoiceLike[];
}

export interface OpenAIClientLike {
    chat: {
        completions: {
            create(request: Record<string, unknown>): Promise<OpenAIChatCompletionLike>;
        };
    };
    audio?: {
        transcriptions?: {
            create(request: Record<string, unknown>): Promise<{ text?: string }>;
        };
    };
}
