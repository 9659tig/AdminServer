import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { AgentTool } from './types';

export class VideoFrameExtractorTool implements AgentTool {
    async run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const localVideoPath = typeof input.localVideoPath === 'string' ? input.localVideoPath : '';
        const startSec = typeof input.startSec === 'number' ? input.startSec : 0;
        const endSec = typeof input.endSec === 'number' ? input.endSec : undefined;
        const frameIntervalSec = typeof input.frameIntervalSec === 'number' ? input.frameIntervalSec : 10;
        const maxFrames = typeof input.maxFrames === 'number' ? input.maxFrames : 6;

        if (!localVideoPath || !fs.existsSync(localVideoPath)) {
            throw new Error(`Video file not found: ${localVideoPath}`);
        }

        ffmpeg.setFfmpegPath(ffmpegInstaller.path);

        const durationSec = await this.getSegmentDuration(localVideoPath, startSec, endSec);
        const tmpDirId = randomUUID();
        const tmpDir = path.join(os.tmpdir(), `agent-frames-${tmpDirId}`);
        fs.mkdirSync(tmpDir, { recursive: true });

        try {
            await this.extractFrames(localVideoPath, startSec, durationSec, frameIntervalSec, maxFrames, tmpDir);
            const imageUrls = this.readFramesAsBase64(tmpDir);

            // 오디오는 추출하지 않음 — vision confidence 부족 시 TranscriptExtractTool이 직접 추출
            return { imageUrls, durationSec, tmpDirId };
        } catch (err) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            throw err;
        }
    }

    private getSegmentDuration(videoPath: string, startSec: number, endSec?: number): Promise<number> {
        if (endSec !== undefined) {
            return Promise.resolve(Math.max(0, endSec - startSec));
        }
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) reject(err);
                else resolve(Math.max(0, (metadata.format.duration ?? 0) - startSec));
            });
        });
    }

    private extractFrames(
        videoPath: string,
        startSec: number,
        durationSec: number,
        frameIntervalSec: number,
        maxFrames: number,
        tmpDir: string,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .inputOptions(['-ss', String(startSec), '-t', String(durationSec)])
                .outputOptions([`-vf`, `fps=1/${frameIntervalSec}`, `-frames:v`, String(maxFrames)])
                .output(path.join(tmpDir, 'frame%d.jpg'))
                .on('end', () => resolve())
                .on('error', reject)
                .run();
        });
    }

    private readFramesAsBase64(tmpDir: string): string[] {
        return fs.readdirSync(tmpDir)
            .filter((f) => /^frame\d+\.jpg$/.test(f))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
                const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
                return numA - numB;
            })
            .map((f) => {
                const data = fs.readFileSync(path.join(tmpDir, f));
                return `data:image/jpeg;base64,${data.toString('base64')}`;
            });
    }
}
