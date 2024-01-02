import { Request, Response } from 'express';
import { createClip } from '../utils/clipcreator'
import { videoInfoDetail } from './videoController';
import { getClipInfo } from '../service/clips'

export const addNewClip = async(req: Request, res: Response) => {
    try {
        const { startTime, endTime, videoSrc, channelId } = req.body;
        const videoUrl = 'https://taewons3.s3.ap-northeast-2.amazonaws.com/' + videoSrc;

        if (!channelId)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
        if (!startTime)
            return res.status(400).send({ error: '입력 형식 에러', message: 'startTime값이 없습니다.' });
        if (!endTime)
            return res.status(400).send({ error: '입력 형식 에러', message: 'endTime값이 없습니다.' });
        if (!req.body.videoSrc)
            return res.status(400).send({ error: '입력 형식 에러', message: 'videoSrc값이 없습니다.' });

        const result = await createClip(videoUrl, startTime, endTime, channelId, videoInfoDetail);
        if (result) return res.send({ success: true });
    } catch (err) {
        console.error('Clip creation failed.');
        console.log(err);
        return res.status(500).send({ error: '클립 생성에 실패했습니다.' });
    }
}

export const getClipList = async(req: Request, res: Response)=>{
    const videoId = req.params.videoId;
    if(!videoId)
        return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 없습니다.' });
    if (typeof videoId !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 잘못되었습니다.' });
    try{
        const clipList = await getClipInfo(videoId)
        return res.send(clipList)
    }catch (err) {
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '클립 목록 정보를 가져오지 못했습니다.' });
    }
}
