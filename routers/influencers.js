const express = require('express');
const router = express.Router();
const { getChannelInfo } = require('../utils/youtubeapi');
const { createClip } = require('../controller/clipcreator');
const { addInfluencer} = require('../service/influencers')
const { videoInformation } = require('../controller/videoInfo')

// 동영상 링크 정보 가져오기 (auto 버튼)
let videoInfoDetail
router.get('/videos', async (req, res) => {
    const videoUrl = decodeURIComponent(req.query.videoUrl);
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
router.get('/channel', async (req, res) => {
    const channelId = decodeURIComponent(req.query.channelID);
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

// 인플루언서 저장
router.post('/info', async (req, res) => {
    try {
        const data = req.body;
        if (!data.channel_ID)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
        if (!data.channel_link)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Link값이 없습니다.' });
        if (!data.channel_name)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Name값이 없습니다.' });
        await addInfluencer(data)
        return res.send({ message: 'successful' });
    } catch (err) {
        console.log(err);
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
router.post('/clip', async (req, res) => {
    try {
        const startTime = req.body.startTime;
        const endTime = req.body.endTime;
        const videoUrl = 'https://taewons3.s3.ap-northeast-2.amazonaws.com/' + req.body.videoSrc;
        const channelID = req.body.channelId;

        const result = await createClip(videoUrl, startTime, endTime, channelID, videoInfoDetail);
        if (result) return res.send({ success: true });
    } catch (err) {
        console.error('Clip creation failed.');
        console.log(err);
        return res.status(500).send({ error: '클립 생성에 실패했습니다.' });
    }
});

module.exports = router;
