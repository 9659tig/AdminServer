import { S3_ACCESS } from '../config/secret';
import { s3Client } from '../config/s3';

const { ListObjectsV2Command, ListObjectsCommand} = require('@aws-sdk/client-s3');

async function gets3Images(prefix: string){
    const params = {
        Bucket: S3_ACCESS.BUCKET,
        Prefix: prefix
    };

    const command = new ListObjectsV2Command(params);

    try{
        const result = await s3Client.send(command);
        return result.Contents;
    }catch(err){
        console.log(err);
        throw err
    }
}

async function listImageFilesInBucket(folderName: string): Promise<string[]> {
    const command = new ListObjectsCommand({
        Bucket: S3_ACCESS.BUCKET,
        Prefix: folderName
    });

    try {
        const response = await s3Client.send(command);
        const imageExtensions = ['jpg', 'jpeg', 'png'];

        const imageFiles = response.Contents?.filter((file: { Key: string; }) => {
            if (file.Key) {
                const extension = file.Key.split('.').pop()?.toLowerCase();
                return extension && imageExtensions.includes(extension);
            }
            return false;
        }).map((file: { Key: string; }) => `https://${S3_ACCESS.BUCKET}.s3.amazonaws.com/${file.Key}`);

        return imageFiles || [];
    } catch (err) {
        console.error(err);
        throw err;
    }
}

export {
    gets3Images,
    listImageFilesInBucket
};
