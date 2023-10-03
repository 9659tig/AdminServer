import express, { Request, Response, Router } from 'express';
const router: Router = express.Router();
import { getChannelInfo } from'../utils/youtubeapi';
import { createClip } from '../controller/clipcreator';
import { addInfluencer } from '../service/influencers';
import { videoInformation } from '../controller/videoInfo';
import { getInfluencerVideos } from '../service/videos';
import { getClipInfo } from '../service/clips'
import { gets3Images, listImageFilesInBucket } from '../utils/getS3Images';

interface VideoInfoDetail {
    videoId: string;
    uploadDate: string;
    thumbnail: string;
    videoTitle: string;
    viewCount: string;
    videoTag: string;
}
// 동영상 링크 정보 가져오기 (auto 버튼)
let videoInfoDetail: VideoInfoDetail;
router.get('/video', async (req: Request, res: Response) => {
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
});

// 채널 ID 정보 가져오기 (+버튼)
router.get('/channel', async (req: Request, res: Response) => {
    const channelId: string = decodeURIComponent(req.query.channelID as string);
    try{
        const channelData = await getChannelInfo(channelId);
        return res.send(channelData);
    }
    catch(err){
        console.error(err);
        return res.status(500).send({
            error: 'youtube api 에러',
            message: '채널 정보를 가져오지 못했습니다.'
        });
    }
});

function isErrorWithCode(err: unknown): err is { code: string } {
    return !!err && typeof err === 'object' && 'code' in err;
}
// 인플루언서 저장
router.post('/info', async (req: Request, res: Response) => {
    try {
        const {channel_ID, channel_link, channel_description, pfp_url, banner_url, channel_name, email, instagram, links} = req.body;

        if (!channel_ID)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
        if (!channel_link)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Link값이 없습니다.' });
        if (!channel_name)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Name값이 없습니다.' });

        await addInfluencer(channel_ID, channel_link, channel_description, pfp_url, banner_url, channel_name, email, instagram, JSON.parse(links));
        return res.send({ message: 'successful' });
    } catch (err) {
        console.log(err);

        if (!isErrorWithCode(err)) {
            console.log('Unexpected error:', err);
            return res.status(500).send({ error: 'Unexpected error', message: 'An unexpected error occurred.' });
        }

        if (err.code === 'ValidationException') {
            return res.status(400).send({ error: 'DB에러', message: 'DynamoDB 요청이 잘못되었습니다.' });
        } else if (err.code === 'ResourceNotFoundException') {
            return res.status(404).send({ error: 'DB에러', message: '테이블이 존재하지 않습니다.' });
        } else {
            return res.status(500).send({ error: 'DB에러', message: 'DynamoDB에 데이터 저장 중 오류가 발생했습니다.' });
        }
    }
})

// 클립 생성
router.post('/clip', async (req: Request, res: Response) => {
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
});

// 비디오 목록 가져오기
router.get('/videos', async (req: Request, res: Response)=>{
    try{
        const channelId = req.query.channelID;
        if(!channelId)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
        if (typeof channelId !== 'string')
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 잘못되었습니다.' });


        const videoList = await getInfluencerVideos(channelId)
        return res.send(videoList)
    }catch (err) {
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '비디오 목록 정보를 가져오지 못했습니다.' });
    }
})

// 클립 영상 목록 가져오기
router.get('/clips', async (req: Request, res: Response)=>{
    try{
        const videoId = req.query.videoID;
        if(!videoId)
            return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 없습니다.' });
        if (typeof videoId !== 'string')
            return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 잘못되었습니다.' });


        const clipList = await getClipInfo(videoId)
        return res.send(clipList)
    }catch (err) {
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '클립 목록 정보를 가져오지 못했습니다.' });
    }
})

// 상품 이미지 가져오기
router.get('/products', async (req: Request, res: Response)=>{
    const {channelID, videoID, createDate} = req.query
    if(!channelID)
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
    if (typeof channelID !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 잘못되었습니다.' });

    if(!videoID)
        return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 없습니다.' });
    if (typeof videoID !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 잘못되었습니다.' });

    if(!createDate)
        return res.status(400).send({ error: '입력 형식 에러', message: 'create Date값이 없습니다.' });
    if (typeof createDate !== 'string')
        return res.status(400).send({ error: '입력 형식 에러', message: 'create Date값이 잘못되었습니다.' });

    try{
        const images = await listImageFilesInBucket(channelID+'/'+videoID+'/'+createDate)
        return res.send(images)
    }catch(err){
        console.log(err);
        return res.status(404).send({ error: 'S3에러', message: '상품 이미지를 가져오지 못했습니다.' });
    }
})

//상품 정보 등록
router.post('/products', async (req: Request, res: Response)=>{
    try{

        const {link} = req.body
    }catch(err){
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '상품 정보를 저장하지 못했습니다.' });
    }
})

export default router;
