import { Request, Response } from 'express';
import { getClipInfo } from '../service/clips';

export const getClipList = async (req: Request, res: Response) => {
    const { videoId } = req.validated.params as { videoId: string };
    try {
        const clipList = await getClipInfo(videoId);
        return res.send(clipList);
    } catch (err) {
        req.log.error({
            event: 'clip_list_failed',
            err,
            videoId,
        }, 'clip_list_failed');
        return res.status(404).send({ error: 'DB에러', message: '클립 목록 정보를 가져오지 못했습니다.' });
    }
};
