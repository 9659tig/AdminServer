/*
const {DYNAMO_ACCESS} = require('./secret')
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const docClient = new DynamoDBClient({
    region: 'ap-northeast-2',
    //endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com",
    credentials:{
        accessKeyId: DYNAMO_ACCESS.KEY,
        secretAccessKey: DYNAMO_ACCESS.SECRET_KEY,
    }
});

module.exports = docClient;
*/

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DYNAMO_ACCESS } from './secret';

const docClient = new DynamoDBClient({
    region: 'ap-northeast-2',
    credentials:{
        accessKeyId: DYNAMO_ACCESS.KEY,
        secretAccessKey: DYNAMO_ACCESS.SECRET_KEY,
    }
} as any);

export default docClient;
