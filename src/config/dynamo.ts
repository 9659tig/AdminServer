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
