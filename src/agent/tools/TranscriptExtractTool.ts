import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { GroqProvider, groqProvider } from '../providers/llm/GroqProvider';
import { TranscriptExtractionResult } from '../workflows/productTypes';

interface TranscriptToolDeps {
    provider?: Pick<GroqProvider, 'transcribe'>;
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

            const response = await (this.deps.provider ?? groqProvider).transcribe({
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

        // localVideoPath: vision confidence 부족 시 직접 오디오 추출
        const localVideoPath = typeof input.localVideoPath === 'string'
            ? input.localVideoPath.trim()
            : typeof clipContext.localVideoPath === 'string'
                ? clipContext.localVideoPath.trim()
                : '';
        if (localVideoPath && fs.existsSync(localVideoPath)) {
            return this.extractAudioFromVideo(localVideoPath, input);
        }

        // clipLink URL fetch (기존 fallback)
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

    private async extractAudioFromVideo(
        videoPath: string,
        input: Record<string, unknown>,
    ): Promise<File> {
        ffmpeg.setFfmpegPath(ffmpegInstaller.path);

        const startSec = typeof input.startSec === 'number' ? input.startSec : 0;
        const endSec = typeof input.endSec === 'number' ? input.endSec : undefined;
        const durationSec = endSec !== undefined ? endSec - startSec : undefined;

        const tmpPath = path.join(os.tmpdir(), `transcript-audio-${randomUUID()}.mp3`);

        await new Promise<void>((resolve, reject) => {
            const cmd = ffmpeg(videoPath)
                .inputOptions(durationSec !== undefined
                    ? ['-ss', String(startSec), '-t', String(durationSec)]
                    : ['-ss', String(startSec)],
                )
                .outputOptions(['-ac', '1', '-ar', '16000', '-q:a', '4'])
                .noVideo()
                .output(tmpPath)
                .on('end', () => resolve())
                .on('error', reject);
            cmd.run();
        });

        const buffer = fs.readFileSync(tmpPath);
        fs.rmSync(tmpPath, { force: true });
        return new File([buffer], 'audio.mp3', { type: 'audio/mpeg' });
    }
}
