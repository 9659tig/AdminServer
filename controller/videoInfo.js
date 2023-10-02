const { getInfluencer } = require('../service/influencers')
const ytdl = require('ytdl-core');

async function videoInformation(videoUrl){
    const info = await ytdl.getInfo(videoUrl);
    console.log("=====videoInfo=======")
    console.log(info.videoDetails);
    const videoInfoDetail = {
        "videoId" : info.videoDetails.videoId,
        "uploadDate" : info.videoDetails.uploadDate,
        "thumbnail": info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 2],
        "videoTitle": info.videoDetails.title,
        "viewCount": info.videoDetails.viewCount
    }
    try{
        const isInfluencer = await getInfluencer(info.videoDetails.author.id);
        const videoInfo = {
            "name" : info.videoDetails.author.name,
            "title": info.videoDetails.title,
            "id": info.videoDetails.author.id,
        }
        videoInfo.exist = isInfluencer
        return {
            videoInfoDetail: videoInfoDetail,
            videoInfo: videoInfo
        };
    }catch (err) {
        throw err
    }
}

module.exports = {videoInformation};