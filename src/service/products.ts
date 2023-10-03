import docClient from '../config/dynamo';
import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

async function getProductInfo(productId: string) {
    const params = {
        TableName: 'Videos',
        KeyConditionExpression: "productId = :productId",
        ExpressionAttributeValues: {
        ":productId": { S: productId }
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
/*
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
*/
export{
    getProductInfo,
    //addVideoInfo,
};