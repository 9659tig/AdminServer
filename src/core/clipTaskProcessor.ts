import { createLogger } from '../config/logger';
import { taskStore } from './taskStore';
import { createClip } from '../utils/clipcreator';
import { videoInformation } from '../utils/videoInfo';
import { S3_ACCESS } from '../config/secret';

export interface ClipTaskInput {
    startTime: number;
    endTime: number;
    videoSrc: string;
    channelId: string;
    videoUrl: string;
    name?: string;
}

function buildSourceVideoUrl(videoSrc: string): string {
    return `https://${S3_ACCESS.BUCKET}.s3.${S3_ACCESS.REGION}.amazonaws.com/${videoSrc}`;
}

export async function processClipTask(taskId: string, input: ClipTaskInput, requestId: string): Promise<void> {
    const taskLogger = createLogger({
        requestId,
        taskId,
        taskType: 'clip',
    });

    await taskStore.update(taskId, {
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
    });

    taskLogger.info({
        event: 'clip_task_started',
        channelId: input.channelId,
        videoUrl: input.videoUrl,
    }, 'clip_task_started');

    try {
        const { videoInfoDetail } = await videoInformation(input.videoUrl);
        await createClip(
            buildSourceVideoUrl(input.videoSrc),
            input.startTime,
            input.endTime,
            input.channelId,
            videoInfoDetail,
        );

        await taskStore.update(taskId, {
            status: 'COMPLETED',
            result: { success: true },
            finishedAt: new Date().toISOString(),
        });

        taskLogger.info({
            event: 'clip_task_completed',
        }, 'clip_task_completed');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await taskStore.update(taskId, {
            status: 'FAILED',
            error: message,
            finishedAt: new Date().toISOString(),
        });
        taskLogger.error({
            event: 'clip_task_failed',
            err,
        }, 'clip_task_failed');
    }
}
