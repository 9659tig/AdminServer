import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { updateCategory } from '../service/videos'
import { syncProduct } from '../utils/userServerSyncClient';

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


async function addProduct(clipLink: string, link: string, deeplink: string, images: string, name: string, brand: string, price: string, category: string, videoId: string, categoryUpdate: boolean, channelId: string, meta: string) {
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
            productPrice: { N: price},
            views: { N: '0'},
            purchases: { N: '0'},
            metaInfo: {S: meta}
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
        syncProduct({
            id: clipLink,
            clipLink,
            productLink: link,
            productDeepLink: deeplink,
            productImages: images,
            productName: name,
            productBrand: brand,
            productPrice: Number(price),
            category,
            videoId,
            channelId,
            metaInfo: meta,
            views: 0,
            purchases: 0,
        });
    }catch(err){
        throw err
    }

}

export{
    getProductInfo,
    addProduct,
};