import Groq from 'groq-sdk';
import { getEnv } from '../../../config/env';
import { logger } from '../../../config/logger';
import { modelPolicyRegistry } from './modelPolicy';
import { LlmGeneratedTranscription, LlmTranscriptionRequest, ModelPolicyRegistry } from './types';

interface GroqProviderDeps {
    policyRegistry?: ModelPolicyRegistry;
    apiKey?: string;
}

export class GroqProvider {
    private client?: Groq;

    constructor(private readonly deps: GroqProviderDeps = {}) {}

    async transcribe(request: LlmTranscriptionRequest): Promise<LlmGeneratedTranscription> {
        const policy = (this.deps.policyRegistry ?? modelPolicyRegistry).resolve(request.policy);
        const groq = this.getClient();

        const response = await groq.audio.transcriptions.create({
            file: request.file as File,
            model: policy.model,
            language: request.language ?? 'ko',
            temperature: request.temperature ?? policy.temperature,
        });

        const text = typeof response.text === 'string' ? response.text.trim() : '';
        if (!text) {
            throw new Error(`Groq returned empty transcription for policy ${request.policy}`);
        }

        logger.info({
            event: 'llm_transcription_generated',
            policy: request.policy,
            model: policy.model,
            provider: 'groq',
        }, 'llm_transcription_generated');

        return {
            policy: request.policy,
            model: policy.model,
            text,
        };
    }

    private getClient(): Groq {
        if (!this.client) {
            const apiKey = this.deps.apiKey ?? getEnv().GROQ_API_KEY;
            this.client = new Groq({ apiKey });
        }
        return this.client;
    }
}

export const groqProvider = new GroqProvider();
