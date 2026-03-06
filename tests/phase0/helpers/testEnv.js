function applyTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.S3_BUCKET_NAME = 'test-bucket';
  process.env.S3_BUCKET_REGION = 'ap-northeast-2';
  process.env.S3_ACCESS_KEY = 'test-s3-access-key';
  process.env.S3_SECRET_KEY = 'test-s3-secret-key';
  process.env.DYNAMO_ACCESS_KEY = 'test-dynamo-access-key';
  process.env.DYNAMO_SECRET_KEY = 'test-dynamo-secret-key';
  process.env.GOOGLE_API_KEY = 'test-google-api-key';
  process.env.OPENAI_API_KEY = 'test-openai-api-key';
  process.env.COUPANG_ACCESS_KEY = 'test-coupang-access-key';
  process.env.COUPANG_SECRET_KEY = 'test-coupang-secret-key';
}

module.exports = {
  applyTestEnv,
};
