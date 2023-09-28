const docClient = require('../config/dynamo')
const {PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");

async function getVideoInfo(channelID) {
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

async function addVideoInfo(channelID, videoInfo) {
    const params = {
        TableName: 'Videos',
        Item: {
            channelId: {S: channelID },
            uploadDate: { S: videoInfo.uploadDate },
            videoThumbnail: {S: videoInfo.thumbnail.url},
            videoName: { S: videoInfo.videoTitle },
            videoId: { S: videoInfo.videoId},
        }
    };
    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
    }catch(err){
        throw err
    }

}

module.exports = {
    getVideoInfo,
    addVideoInfo,
};