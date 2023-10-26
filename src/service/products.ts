import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

async function getProductInfo(productLink: string, channelId: string) {
    const params = {
        TableName: 'Products',
        IndexName: 'productLink-channelId-index',
        KeyConditionExpression: "productLink = :productLink and channelId = :channelId",
        ExpressionAttributeValues: {
            ":productLink": { S: productLink },
            ":channelId": { S: channelId }
        }
    };

    try {
        const command = new QueryCommand(params);
        const result = await docClient.send(command);
        console.log(result.Items);

        return result.Items;
    } catch (err) {
        throw err;
    }
}


async function addProduct(clipLink: string, link: string, deeplink: string, images: string, name: string, brand: string, price: string, category: string, channelId: string) {
    const params = {
        TableName: 'Products',
        Item: {
            clipLink: { S: clipLink },
            productLink: { S: link },
            productDeepLink: { S: deeplink },
            productImages: { S: images },
            productName: { S: name },
            productBrand: { S: brand },
            category: { S: category },
            channelId: { S: channelId },
            productPrice: { N: price },
            views: { N: '0'},
            purchases: { N: '0'}

        }
    };
    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
    }catch(err){
        throw err
    }

}

export{
    getProductInfo,
    addProduct,
};