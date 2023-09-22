const AWS = require('aws-sdk');
const {DYNAMO_ACCESS} = require('./secret')
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");


const docClient = new DynamoDBClient({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com",
    credentials:{
        accessKeyId: DYNAMO_ACCESS.KEY,
        secretAccessKey: DYNAMO_ACCESS.SECRET_KEY,
    }
});

module.exports = docClient;