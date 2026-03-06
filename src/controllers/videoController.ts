import { Request, Response } from 'express';
import { videoInformation } from '../utils/videoInfo';
import { getInfluencerVideos } from '../service/videos'

export const getVideoInfo = async(req: Request, res: Response) => {
    const { videoUrl } = req.validated.query as { videoUrl: string };
    try {
        const result = await videoInformation(videoUrl);
        req.log.info({
            event: 'video_info_loaded',
            channelId: result.videoInfo.id,
        }, 'video_info_loaded');
        return res.send(result.videoInfo);
    }catch (err) {
        req.log.error({
            event: 'video_info_failed',
            err,
        }, 'video_info_failed');
        return res.status(500).send({
            error: 'DB에러',
            message: '동영상 링크 정보를 가져오지 못했습니다.'
        });
    }
}

export const getVideoList = async(req: Request, res: Response) => {
    const { channelId } = req.validated.params as { channelId: string };

    try{
        const videoList = await getInfluencerVideos(channelId);
        return res.send(videoList);
    }catch (err) {
        req.log.error({
            event: 'video_list_failed',
            err,
            channelId,
        }, 'video_list_failed');
        return res.status(404).send({ error: 'DB에러', message: '비디오 목록 정보를 가져오지 못했습니다.' });
    }
}
