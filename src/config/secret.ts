import { getEnv } from './env';

const env = getEnv();

const S3_ACCESS = {
    BUCKET: env.S3_BUCKET_NAME,
    REGION: env.S3_BUCKET_REGION,
    KEY: env.S3_ACCESS_KEY,
    SECRET_KEY: env.S3_SECRET_KEY
}

const DYNAMO_ACCESS = {
    KEY: env.DYNAMO_ACCESS_KEY,
    SECRET_KEY: env.DYNAMO_SECRET_KEY
}

const GOOGLE_API_KEY = env.GOOGLE_API_KEY

const CHATGPT_API_KEY = env.OPENAI_API_KEY;

const COUPANG_ACCESS = {
    KEY: env.COUPANG_ACCESS_KEY,
    SECRET_KEY: env.COUPANG_SECRET_KEY
}

export {
    S3_ACCESS,
    GOOGLE_API_KEY,
    DYNAMO_ACCESS,
    CHATGPT_API_KEY,
    COUPANG_ACCESS
};
