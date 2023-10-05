import { Request, Response } from 'express';
import { videoInformation } from '../utils/videoInfo';
import { getInfluencerVideos } from '../service/videos'

interface VideoInfoDetail {
    videoId: string;
    uploadDate: string;
    thumbnail: string;
    videoTitle: string;
    viewCount: string;
    videoTag: string;
}

export let videoInfoDetail: VideoInfoDetail;

export const getVideoInfo = async(req: Request, res: Response) => {
    const videoUrl: string = decodeURIComponent(req.query.videoUrl as string);
    try {
        const result = await videoInformation(videoUrl)
        videoInfoDetail = result.videoInfoDetail
        return res.send(result.videoInfo)
    }catch (err) {
        console.error(err);
        return res.status(500).send({
            error: 'DB에러',
            message: '동영상 링크 정보를 가져오지 못했습니다.'
        });
    }
}

export const getVideoList = async(req: Request, res: Response) => {
    const channelId = req.query.channelID;
    if(!channelId)
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
    if (typeof channelId !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 잘못되었습니다.' });

    try{
        const videoList = await getInfluencerVideos(channelId)
        return res.send(videoList)
    }catch (err) {
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '비디오 목록 정보를 가져오지 못했습니다.' });
    }
}