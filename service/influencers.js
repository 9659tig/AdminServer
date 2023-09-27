const docClient = require('../config/dynamo')
const {PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");

async function getInfluencer(channelID) {
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
        if (result.Items.length > 0) return true
        else return false
    }catch(err){
        throw err
    }
}

async function addInfluencer(data) {
    const links = JSON.parse(data.links);
    const params = {
        TableName: 'Influencers',
        Item: {
            channelId: { S: data.channel_ID },
            channelLink: { S: data.channel_link },
            channelDescription: { S: data.channel_description },
            channelProfile: { S: data.pfp_url },
            channelBanner: { S: data.banner_url },
            channelName: { S: data.channel_name },
            email: { S: data.email },
            instagram: { S: data.instagram },
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

module.exports = {
    getInfluencer,
    addInfluencer,
};
