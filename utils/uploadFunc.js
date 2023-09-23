const { S3_ACCESS } = require('../config/secret');
const s3Client = require('../config/s3');
const { Upload } = require('@aws-sdk/lib-storage');

async function uploadClip(fileStream, key) {
    const params = {
        Bucket: S3_ACCESS.BUCKET,
        Body: fileStream,
        Key: key,
        ContentType: 'video/mp4'
    };

    const uploadS3 = new Upload({
        client: s3Client,
        params: params
    });

    uploadS3.on('httpUploadProgress', (progress)=>{
        console.log(progress);
    });

    try{
        await uploadS3.done();
        return 'success';
    }catch(err){
        console.log(err);
        throw err
    }
}

module.exports = {
    uploadClip,
};

