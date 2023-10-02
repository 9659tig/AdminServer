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

async function addVideoInfo(productInfo) {
    const params = {
        TableName: 'Products',
        Item: {
            productId: {S: productInfo.id},
            productLink: { S: productInfo.link},
            productImages: { S: productInfo.images },
            productName: {S: productInfo.name},
            productBrand: { S: productInfo.brand },
            productPrice: { S: productInfo.price},
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