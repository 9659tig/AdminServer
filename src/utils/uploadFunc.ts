import { S3_ACCESS } from '../config/secret';
import { s3Client } from '../config/s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

async function uploadClip(fileStream: Readable, key: string): Promise<boolean> {
    console.log("==s3==");
    console.log(key);
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
        return true;
    }catch(err){
        console.log(err);
        throw err
    }
}

export {
    uploadClip
};

