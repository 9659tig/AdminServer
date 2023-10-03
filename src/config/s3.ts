const {S3_ACCESS} = require('./secret')
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: S3_ACCESS.REGION,
  credentials: {
    accessKeyId: S3_ACCESS.KEY,
    secretAccessKey: S3_ACCESS.SECRET_KEY
  },
});

export {s3Client};