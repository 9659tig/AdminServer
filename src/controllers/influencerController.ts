import { Request, Response } from 'express';
import { getYoutubeChannelInfo } from'../utils/youtubeapi';
import { addInfluencer } from '../service/influencers';
import { Sns } from '../utils/interfaces/influencer.interface';

export const getChannelInfo = async(req: Request, res: Response) => {
    const { channelId } = req.validated.params as { channelId: string };
    try{
        const channelData = await getYoutubeChannelInfo(channelId);
        return res.send(channelData);
    }
    catch(err){
        req.log.error({
            event: 'channel_info_failed',
            err,
            channelId,
        }, 'channel_info_failed');
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
    const {channel_ID, channel_link, channel_description, pfp_url, banner_url, channel_name, email, links, subscriberCount} = req.validated.body as {
        channel_ID: string;
        channel_link: string;
        channel_description: string;
        pfp_url: string;
        banner_url: string;
        channel_name: string;
        email: string;
        links: Sns[];
        subscriberCount: number;
    };
    try {
        const snsLinks: Sns[] = [...links];
        snsLinks.push({
            type : "youtube",
            link : channel_link
        });

        await addInfluencer(channel_ID, channel_link, channel_description, pfp_url, banner_url, channel_name, email, snsLinks, subscriberCount);
        return res.send({ message: 'successful' });
    } catch (err) {
        if (!isErrorWithCode(err)) {
            req.log.error({
                event: 'influencer_create_failed_unexpected',
                err,
            }, 'influencer_create_failed_unexpected');
            return res.status(500).send({ error: 'Unexpected error', message: 'An unexpected error occurred.' });
        }

        if (err.code === 'ValidationException') {
            return res.status(400).send({ error: 'DB에러', message: 'DynamoDB 요청이 잘못되었습니다.' });
        } else if (err.code === 'ResourceNotFoundException') {
            return res.status(404).send({ error: 'DB에러', message: '테이블이 존재하지 않습니다.' });
        } else {
            req.log.error({
                event: 'influencer_create_failed',
                err,
                channelId: channel_ID,
            }, 'influencer_create_failed');
            return res.status(500).send({ error: 'DB에러', message: 'DynamoDB에 데이터 저장 중 오류가 발생했습니다.' });
        }
    }
}
