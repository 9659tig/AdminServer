const {S3_ACCESS} = require('./secret')

const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const s3Client = new S3Client({
  region: S3_ACCESS.REGION,
  credentials: {
    accessKeyId: S3_ACCESS.KEY,
    secretAccessKey: S3_ACCESS.SECRET_KEY
  },
});


async function uploadClip(fileStream, filename) {
    console.log('Video upload function called.');
    const uploadParams = {
      Bucket: S3_ACCESS.BUCKET,
      Body: fileStream,
      Key: filename,
    };
    console.log('Uploading to S3...');
    const parallelUploads3 = new Upload({ client: s3Client, params: uploadParams });
    parallelUploads3.on('httpUploadProgress', (progress) => {
      console.log(progress);
    });
    await parallelUploads3.done();

    console.log('Upload Completed');
    return 'success';
  }


  exports.uploadClip = uploadClip;

  async function uploadJSON(fileStream, filename) {
    console.log('JSON upload function called.');
    const uploadParams = {
      Bucket: S3_ACCESS.BUCKET,
      Body: fileStream,
      Key: filename,
      ContentType: 'application/json'
    };
    console.log('Uploading to S3...');
    const parallelUploads3 = new Upload({ client: s3Client, params: uploadParams });
    parallelUploads3.on('httpUploadProgress', (progress) => {
      console.log(progress);
    });
    await parallelUploads3.done();

    console.log('Upload Completed');
    return 'success';
  }


  exports.uploadJSON = uploadJSON;