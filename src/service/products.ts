import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { updateCategory } from '../service/videos'

async function getProductInfo(productLink: string) {
    const params = {
        TableName: 'Products',
        IndexName: 'productLink-channelId-index',
        KeyConditionExpression: "productLink = :productLink",
        ExpressionAttributeValues: {
            ":productLink": { S: productLink }
        }
    };

    try {
        const command = new QueryCommand(params);
        const result = await docClient.send(command);
        return result.Items;
    } catch (err) {
        throw err;
    }
}


async function addProduct(clipLink: string, link: string, deeplink: string, images: string, name: string, brand: string, price: string, category: string, videoId: string, categoryUpdate: boolean, channelId: string) {
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
            videoId: { S: videoId },
            channelId: { S: channelId },
            productPrice: { N: price },
            views: { N: '0'},
            purchases: { N: '0'}
        }
    };
    try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
        if (categoryUpdate){
            const categoryType: string = 'category' + category;
            try{
                await updateCategory(channelId, videoId, categoryType);
            }catch(err){
                throw err
            }
        }
    }catch(err){
        throw err
    }

}

export{
    getProductInfo,
    addProduct,
};