import { Request, Response } from 'express';
import { getYoutubeChannelInfo } from'../utils/youtubeapi';
import { addInfluencer } from '../service/influencers';
import { Sns } from '../utils/interfaces/influencer.interface';

export const getChannelInfo = async(req: Request, res: Response) => {
    const channelId = req.params.channelId;
    try{
        const channelData = await getYoutubeChannelInfo(channelId);
        return res.send(channelData);
    }
    catch(err){
        console.error(err);
        return res.status(500).send({
            error: 'youtube api 에러',
            message: '채널 정보를 가져오지 못했습니다.'
        });
    }
}

function isErrorWithCode(err: unknown): err is { code: string } {
    return !!err && typeof err === 'object' && 'code' in err;
}

export const addInfluencerInfo = async(req: Request, res: Response) => {
    const {channel_ID, channel_link, channel_description, pfp_url, banner_url, channel_name, email, links, subscriberCount} = req.body;
    try {
        if (!channel_ID)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Id값이 없습니다.' });
        if (!channel_link)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Link값이 없습니다.' });
        if (!channel_name)
            return res.status(400).send({ error: '입력 형식 에러', message: 'channel Name값이 없습니다.' });
        if (links.length != 5)
            return res.status(400).send({ error: '입력 형식 에러', message: 'sns 개수가 부족합니다.' });

        //네이버, 틱톡, 유튜브, 인스타, 페이스북, 트위터
        let snsLinks: Sns[] = links;
        snsLinks.push({
            type : "youtube",
            link : channel_link
        })

        await addInfluencer(channel_ID, channel_link, channel_description, pfp_url, banner_url, channel_name, email, snsLinks, subscriberCount);
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
}