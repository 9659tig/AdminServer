import express, { Request, Response, Router } from 'express';
const router: Router = express.Router();
import { getChannelInfo } from'../utils/youtubeapi';
import { createClip } from '../controller/clipcreator';
import { addInfluencer } from '../service/influencers';
import { videoInformation } from '../controller/videoInfo';
import { getInfluencerVideos } from '../service/videos';
import { getClipInfo } from '../service/clips'

interface VideoInfoDetail {
    videoId: string;
    uploadDate: string;
    thumbnail: string;
    videoTitle: string;
    viewCount: string;
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
        if (typeof channelId !== 'string') {
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 잘못되었습니다.' });
        }

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
        if (typeof videoId !== 'string') {
            return res.status(400).send({ error: '입력 형식 에러', message: 'video Id값이 잘못되었습니다.' });
        }

        const clipList = await getClipInfo(videoId)
        return res.send(clipList)
    }catch (err) {
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '클립 목록 정보를 가져오지 못했습니다.' });
    }
})

//상품 정보 등록
router.post('/products', async (req: Request, res: Response)=>{
    try{
        /*
        1. 클립 영상에 등장하는 상품 라벨 분석해서 s3에저장
            -> 모든 상품에 대해서 저장 or 있는 상품 조회 후 없으면 저장
            -> 라벨과 함께 저장? 분석이 어디까지 진행?
                 - 가방 / 옷 등의 전체 카테고리 (인플루언서 프로필)
                 - 브랜드, 상품명, 가격, 링크 정보 (쇼룸 공간)
        2. 조회하거나 새로 저장한 상품들 s3에서 이미지 가져옴
        3. 가져온 이미지로 다시 구글 이미지 서치
        4. 상위 5개 결과 이미지, 상품 정보, 링크 크롤링 (한 상품 당)
        5. 유효한 결과 선택
        6. 선택된 결과 gpt 통해 상품 정보 가져오기
        7. 가져온 상품 쿠팡에 있는지 확인 후 쿠팡 링크, 상품명, 사진 입력
        */

        /*
        상품 db에 상품 정보들 저장, 인플루언서의 쇼룸에 등록 시 인플루언서 링크 추가
            -> 각각의 구매 링크 or 하나의 구매 링크
        카테고리, 브랜드, 상품명, 가격, 이미지, 구매 링크
        7번 -> 입력받는 정보 : 쿠팡 링크, 상품명, 사진
        카테고리 -> 처음 이미지 라벨링 할 때 s3에 저장?
        브랜드, 가격 -> 어디서?

        매번 구글 이미지 서치를 통해 상위 5개 이미지를 크롤링한다면?
        같은 상품인데 나중에 상품을 등록한 인플루언서와 기존 인플루언서의 상품 이미지가
        달라짐
            결국 보여줄 상품 이미지가 이거라면
            7번 과정이 끝났을 때 카테고리/브랜드/상품명 경로로 이미지들을 s3에 저장
            -> s3에서 위 경로와 이미지를 가져와 db에 저장하고 링크와 가격 입력받음
                (key값을 경로 + channelId로 설정)
        크롤링한 상품 정보가 db에 있다면 경로, 이미지는 수정하지 않고 링크와 가격만
        새로 입력받음
        */
        const {link} = req.body
    }catch(err){
        console.log(err);
        return res.status(404).send({ error: 'DB에러', message: '상품 정보를 저장하지 못했습니다.' });
    }
})

export default router;
