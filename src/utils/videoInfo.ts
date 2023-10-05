import { getInfluencer } from '../service/influencers';
import ytdl from 'ytdl-core';

interface VideoInfo {
    name: string;
    title: string;
    id: string;
    exist: boolean;
}

async function videoInformation(videoUrl: string){
    const info = await ytdl.getInfo(videoUrl);
    //console.log("=====videoInfo=======")
    //console.log(info.videoDetails);

    let HashTag = '';
    if (info.videoDetails.description){
        const linesWithHashTag = info.videoDetails.description.split('\n').filter(line => line.includes('#'));
        if (linesWithHashTag.length > 0) HashTag = linesWithHashTag[0]
    }

    const videoInfoDetail = {
        videoId: info.videoDetails.videoId,
        uploadDate: info.videoDetails.uploadDate,
        thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 2].url,
        videoTitle: info.videoDetails.title,
        viewCount: info.videoDetails.viewCount,
        videoTag: HashTag
    };
    try{
        const isInfluencer = await getInfluencer(info.videoDetails.author.id);
        const videoInfo: VideoInfo = {
            name: info.videoDetails.author.name,
            title: info.videoDetails.title,
            id: info.videoDetails.author.id,
            exist: isInfluencer,
        };
        return {
            videoInfoDetail: videoInfoDetail,
            videoInfo: videoInfo
        };
    }catch (err) {
        throw err;
    }
}

export {videoInformation};
