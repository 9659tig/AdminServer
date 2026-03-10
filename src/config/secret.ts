import { getEnv } from './env';

const env = getEnv();

const DYNAMO_ACCESS = {
    KEY: env.DYNAMO_ACCESS_KEY,
    SECRET_KEY: env.DYNAMO_SECRET_KEY
}

const GOOGLE_API_KEY = env.GOOGLE_API_KEY

const CHATGPT_API_KEY = env.OPENAI_API_KEY ?? '';

const COUPANG_ACCESS = {
    KEY: env.COUPANG_ACCESS_KEY ?? '',
    SECRET_KEY: env.COUPANG_SECRET_KEY ?? '',
}

export {
    GOOGLE_API_KEY,
    DYNAMO_ACCESS,
    CHATGPT_API_KEY,
    COUPANG_ACCESS
};
