import { S3_ACCESS } from '../config/secret';
import { s3Client } from '../config/s3';
import { ListObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

        const imageFiles = (response.Contents ?? [])
            .filter((file) => {
                if (!file.Key) {
                    return false;
                }

                const extension = file.Key.split('.').pop()?.toLowerCase();
                return !!extension && imageExtensions.includes(extension);
            })
            .map((file) => `https://${S3_ACCESS.BUCKET}.s3.amazonaws.com/${file.Key}`);

        return imageFiles;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

export {
    gets3Images,
    listImageFilesInBucket
};
