import { OpenAIProvider, openAIProvider } from '../providers/llm/OpenAIProvider';
import { TranscriptExtractionResult } from '../workflows/productTypes';

interface TranscriptToolDeps {
    provider?: Pick<OpenAIProvider, 'transcribe'>;
    resolveAudioFile?: (input: Record<string, unknown>) => Promise<unknown | undefined>;
    fetchImpl?: typeof fetch;
}

export class TranscriptExtractTool {
    constructor(private readonly deps: TranscriptToolDeps = {}) {}

    async extract(input: Record<string, unknown>): Promise<TranscriptExtractionResult> {
        const clipContext = input.clipContext && typeof input.clipContext === 'object'
            ? input.clipContext as Record<string, unknown>
            : {};

        const spokenText = typeof clipContext.spokenText === 'string'
            ? clipContext.spokenText.trim()
            : '';

        if (spokenText) {
            return {
                text: spokenText,
                source: 'provided_text',
                confidence: 0.95,
                warnings: [],
            };
        }

        try {
            const audioFile = await this.resolveAudioFile(input, clipContext);
            if (!audioFile) {
                return {
                    text: '',
                    source: 'unavailable',
                    confidence: 0,
                    warnings: ['No transcript source available'],
                };
            }

            const response = await (this.deps.provider ?? openAIProvider).transcribe({
                policy: 'transcribe-default',
                file: audioFile,
                language: 'ko',
                temperature: 0,
            });

            return {
                text: response.text,
                source: 'audio_transcription',
                confidence: 0.75,
                warnings: [],
            };
        } catch (err) {
            return {
                text: '',
                source: 'unavailable',
                confidence: 0,
                warnings: [
                    err instanceof Error ? err.message : String(err),
                ],
            };
        }
    }

    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        return {
            transcript: await this.extract(input),
        };
    }

    private async resolveAudioFile(
        input: Record<string, unknown>,
        clipContext: Record<string, unknown>,
    ): Promise<unknown | undefined> {
        const resolvedByHook = await this.deps.resolveAudioFile?.(input);
        if (resolvedByHook) {
            return resolvedByHook;
        }

        const clipLink = typeof clipContext.clipLink === 'string' ? clipContext.clipLink.trim() : '';
        if (!clipLink) {
            return undefined;
        }

        const fetchImpl = this.deps.fetchImpl ?? globalThis.fetch;
        if (!fetchImpl) {
            return undefined;
        }

        const response = await fetchImpl(clipLink);
        if (!response.ok) {
            throw new Error(`clip download failed with status ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        return new File([buffer], 'clip.mp4', { type: 'video/mp4' });
    }
}
