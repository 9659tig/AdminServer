const dotenv = require('dotenv')
dotenv.config()

const S3_ACCESS = {
    BUCKET : process.env.S3_BUCKET_NAME,
    REGION : process.env.S3_BUCKET_REGION,
    KEY : process.env.S3_ACCESS_KEY,
    SECRET_KEY : process.env.S3_SECRET_KEY
}

const DYNAMO_ACCESS = {
    KEY : process.env.DYNAMO_ACCESS_KEY,
    SECRET_KEY : process.env.DYNAMO_SECRET_KEY
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

module.exports = {
    S3_ACCESS,
    GOOGLE_API_KEY,
    DYNAMO_ACCESS
}