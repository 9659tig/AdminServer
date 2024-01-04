import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

async function getInfluencerVideos(channelID: string) {
    const params = {
        TableName: 'Videos',
        KeyConditionExpression: "channelId = :channelId",
        ExpressionAttributeValues: {
            ":channelId": { S: channelID }
        }
    };

    try{
        const command = new QueryCommand(params)
        const result = await docClient.send(command)
        return result.Items
    }catch(err){
        throw err
    }
}

async function getVideoInfo(channelID: string, videoID: string) {
    const params = {
        TableName: 'Videos',
        KeyConditionExpression: "channelId = :channelId and videoId = :videoId",
        ExpressionAttributeValues: {
            ":channelId": { S: channelID },
            ":videoId": { S: videoID }
        }
    };

    try{
        const command = new QueryCommand(params)
        const result = await docClient.send(command)
        return result.Items
    }catch(err){
        throw err
    }
}

interface VideoInfo {
    videoId:string;
    uploadDate:string;
    thumbnail:string;
    videoTitle:string;
    viewCount:string;
    videoTag:string;
}
async function addVideoInfo(channelID: string, videoInfo: VideoInfo) {
    const params = {
        TableName: 'Videos',
        Item: {
            channelId: {S: channelID },
            videoId: { S: videoInfo.videoId},
            uploadDate: { S: videoInfo.uploadDate },
            videoThumbnail: {S: videoInfo.thumbnail},
            videoName: { S: videoInfo.videoTitle },
            viewCount: { N: videoInfo.viewCount},
            videoTag: { S: videoInfo.videoTag},
            categoryBag: { BOOL: false},
            categoryClothes: { BOOL: false},
            categoryFood: { BOOL: false},
        }
    };
    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
    }catch(err){
        throw err
    }

}

async function updateCategory(channelID: string, videoId: string, category: string) {
    const params = {
        TableName: 'Videos',
        Key: {
            channelId: { S: channelID },
            videoId: { S: videoId }
        },
        UpdateExpression: `SET ${category} = :categoryValue`,
        ExpressionAttributeValues: {
            ':categoryValue': { BOOL: true }
        }
    };

    try {
        const command = new UpdateItemCommand(params);
        await docClient.send(command);
    } catch (err) {
        throw err;
    }
}

export {
    getInfluencerVideos,
    getVideoInfo,
    addVideoInfo,
    updateCategory,
};