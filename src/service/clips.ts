import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

export interface ClipRecord {
    videoId: string;
    clipLink: string;
    createDate: string;
    startTime: number;
    endTime: number;
    videoTime: number;
}

function parseNumber(value?: { N?: string; S?: string }): number {
    const raw = value?.N ?? value?.S;
    if (!raw) {
        return 0;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function mapClipItem(item: Record<string, { S?: string; N?: string }>): ClipRecord {
    return {
        videoId: item.videoId?.S ?? '',
        clipLink: item.clipLink?.S ?? '',
        createDate: item.createDate?.S ?? '',
        startTime: parseNumber(item.startTime),
        endTime: parseNumber(item.endTime),
        videoTime: parseNumber(item.videoTime),
    };
}

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

async function getClipInfo(videoID: string): Promise<ClipRecord[]> {
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
        return (result.Items ?? [])
            .map((item) => mapClipItem(item as Record<string, { S?: string; N?: string }>))
            .sort((a, b) => b.createDate.localeCompare(a.createDate));
    }catch(err){
        throw err
    }
}

export {
    addClip,
    getClipInfo
};
