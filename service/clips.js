const docClient = require('../config/dynamo')
const {PutItemCommand, QueryCommand} = require("@aws-sdk/client-dynamodb");

async function addClip(videoId, currentDate, encodeUrl, startTime, endTime) {
    const params = {
        TableName: 'Clips',
        Item: {
            videoId: { S: videoId},
            createDate: { S: currentDate },
            clipLink: { S: encodeUrl },
            startTime: { S: startTime },
            endTime: { S: endTime },
            productId: { S: ''},
        }
    };

    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
    }catch(err){
        throw err
    }

}

async function getClipInfo(videoID) {
    const params = {
        TableName: 'Clips',
        KeyConditionExpression: "videoId = :videoId",
        ExpressionAttributeValues: {
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

module.exports = {
    addClip,
    getClipInfo
};
