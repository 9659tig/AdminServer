const express = require('express');
const router = express.Router();
const ytdl = require('ytdl-core');
const { getChannelInfo } = require('../api/youtubeapi');
const { createClip } = require('../api/clipcreator');
const docClient = require('../config/dynamo')
const {PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");

// 동영상 링크 정보 가져오기 (auto 버튼)
router.get('/videos', async (req, res) => {
    const videoUrl = decodeURIComponent(req.query.videoUrl);
    try {
        const info = await ytdl.getInfo(videoUrl);
        try{
            const params = {
                TableName: 'Influencers',
                KeyConditionExpression: "channelId = :channelId",
                ExpressionAttributeValues: {
                    ":channelId": {S : info.videoDetails.author.id}
                }
            };
            const command = new QueryCommand(params)
            const result = await docClient.send(command)
            if (result.Items.length > 0) {
                res.send({
                    "name" : info.videoDetails.author.name,
                    "title": info.videoDetails.title,
                    "id": info.videoDetails.author.id,
                    "exist": true
                });
            } else {
                res.send({
                    "name" : info.videoDetails.author.name,
                    "title": info.videoDetails.title,
                    "id": info.videoDetails.author.id,
                    "exist": false
                });
            }
        }catch (err) {
            console.error(err);
            res.status(500).send({ error: 'DB Error' });
        }
    }catch (err) {
        console.error(err);
        res.status(500).send({ error: '동영상 링크 정보를 가져오지 못했습니다.' });
    }
});

// 채널 ID 정보 가져오기 (+버튼)
router.get('/channel', async (req, res) => {
    const channelId = decodeURIComponent(req.query.channelID);
    try{
        const channelData = await getChannelInfo(channelId);
        res.send(channelData);
    }
    catch(err){
        console.log(err);
        res.status(500).send({ error: '채널 정보를 가져오지 못했습니다.' });
    }
});

// 인플루언서 저장
router.post('/info', async (req, res) => {
    try {
        const data = req.body;
        if (!data) {
            res.status(400).send({ error: 'Invalid data format in the request.' });
            return;
        }

        const links = JSON.parse(data.links);
        const params = {
            TableName: 'Influencers',
            Item: {
                channelId: { S: data.channel_ID },
                channelLink: { S: data.channel_link },
                channelDescription: { S: data.channel_description },
                channelProfile: { S: data.pfp_url },
                channelBanner: { S: data.banner_url },
                channelName: { S: data.channel_name },
                email: { S: data.email },
                instagram: { S: data.instagram },
                links: { L: links.map(link => ({ M: { type: { S: link.type }, link: { S: link.link } } })) },
            },
        };

        const command = new PutItemCommand(params);
        await docClient.send(command);
        res.send({ message: 'successful' });
    } catch (err) {
        console.log(err);
        if (err.code === 'ValidationException') {
            res.status(400).send({ error: 'DynamoDB 요청이 잘못되었습니다.' });
        } else if (err.code === 'ResourceNotFoundException') {
            res.status(404).send({ error: '테이블이 존재하지 않습니다.' });
        } else {
            res.status(500).send({ error: 'DynamoDB에 데이터 저장 중 오류가 발생했습니다.' });
        }
    }
})

// 클립 생성
router.post('/clip', async (req, res) => {
    try {
        console.log(req.body);
        console.log(req.query);
        const startTime = req.body.startTime;
        const endTime = req.body.endTime;
        const videoUrl = 'https://taewons3.s3.ap-northeast-2.amazonaws.com/' + req.body.videoSrc;
        const clipLoc = req.body.name;
        const channelID = req.body.channelId;

        const response = await createClip(videoUrl, startTime, endTime, clipLoc, channelID);
        if (response) {
            res.send({ success: true });
        } else {
            console.error('Clip creation failed.');
            res.status(500).send({ error: '클립 생성에 실패했습니다.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Server Error' });
    }
});

module.exports = router;
