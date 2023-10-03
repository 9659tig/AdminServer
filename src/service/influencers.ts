import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

async function getInfluencer(channelID: string): Promise<boolean> {
    const params = {
        TableName: 'Influencers',
        KeyConditionExpression: "channelId = :channelId",
        ExpressionAttributeValues: {
        ":channelId": { S:  channelID}
        }
    };

    try{
        const command = new QueryCommand(params)
        const result = await docClient.send(command)
        if(result.Items && result.Items.length >0 ) return true
        else return false
    }catch(err){
        throw err
    }
}

async function addInfluencer(channel_ID: string, channel_link: string, channel_description: string, pfp_url: string, banner_url: string, channel_name: string, email: string, instagram: string, links: Array<{type:string , link:string}>): Promise<boolean> {
    const params = {
        TableName: 'Influencers',
        Item: {
            channelId: { S: channel_ID },
            channelLink: { S: channel_link },
            channelDescription: { S: channel_description },
            channelProfile: { S: pfp_url },
            channelBanner: { S: banner_url },
            channelName: { S: channel_name },
            email: { S: email },
            instagram: { S: instagram },
            links: { L: links.map(link => ({ M: { type: { S: link.type }, link: { S: link.link } } })) },
        },
    };
    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
        return true
    }catch(err){
        throw err
    }

}

export {getInfluencer, addInfluencer};