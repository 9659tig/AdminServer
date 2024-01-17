import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";


async function addClip(videoId: string, currentDate: string, encodeUrl: string, startTime: string, endTime: string, videoTime: string): Promise<void> {
    const params = {
        TableName: 'Clips',
        Item: {
            videoId: { S: videoId},
            clipLink: { S: encodeUrl },
            createDate: { S: currentDate },
            startTime: { S: startTime },
            endTime: { S: endTime },
            videoTime: { S: videoTime},
        }
    };

    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
    }catch(err){
        throw err
    }

}

async function getClipInfo(videoID: string) {
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

export {
    addClip,
    getClipInfo
};
