import { S3Client } from '@aws-sdk/client-s3';
import { S3_ACCESS } from './secret';

const s3Client = new S3Client({
  region: S3_ACCESS.REGION,
  credentials: {
    accessKeyId: S3_ACCESS.KEY,
    secretAccessKey: S3_ACCESS.SECRET_KEY
  },
});

export {s3Client};
