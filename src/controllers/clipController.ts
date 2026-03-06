import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getClipInfo } from '../service/clips';
import { ClipTaskInput, processClipTask } from '../core/clipTaskProcessor';
import { TaskStore, taskStore } from '../core/taskStore';

interface ClipControllerDeps {
    taskStore: TaskStore;
    processClipTask(taskId: string, input: ClipTaskInput, requestId: string): Promise<void>;
}

const defaultDeps: ClipControllerDeps = {
    taskStore,
    processClipTask,
};

export function createAddNewClipHandler(deps: ClipControllerDeps = defaultDeps) {
    return async (req: Request, res: Response) => {
        const input = req.validated.body as ClipTaskInput;
        const taskId = randomUUID();

        await deps.taskStore.create({
            taskId,
            type: 'clip',
            status: 'PENDING',
            input,
            createdAt: new Date().toISOString(),
        });

        req.log.info({
            event: 'clip_task_accepted',
            taskId,
            channelId: input.channelId,
        }, 'clip_task_accepted');

        setImmediate(() => {
            deps.processClipTask(taskId, input, req.requestId).catch((err) => {
                req.log.error({
                    event: 'clip_task_process_crashed',
                    taskId,
                    err,
                }, 'clip_task_process_crashed');
            });
        });

        return res.status(202).json({
            taskId,
            status: 'PENDING',
        });
    };
}

export const addNewClip = createAddNewClipHandler();

export const getClipList = async(req: Request, res: Response)=>{
    const { videoId } = req.validated.params as { videoId: string };
    try{
        const clipList = await getClipInfo(videoId);
        return res.send(clipList);
    }catch (err) {
        req.log.error({
            event: 'clip_list_failed',
            err,
            videoId,
        }, 'clip_list_failed');
        return res.status(404).send({ error: 'DB에러', message: '클립 목록 정보를 가져오지 못했습니다.' });
    }
}
