const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg'); //video handling package(to clip videos)
const randomID = Math.floor(Math.random()*100000);
const mp4OutputFilePath = `${randomID}.mp4`; //file path to download clip locally(temporary)
const fs = require('fs');
const {uploadClip} = require('./uploadFunc')
const {PutItemCommand, QueryCommand,DeleteTableCommand } = require("@aws-sdk/client-dynamodb");
const {S3_ACCESS} = require('../config/secret');
const docClient = require('../config/dynamo');
const moment = require('moment-timezone');

async function createClip(src, startTime, endTime, filename, channelID, videoInfo){
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  try{
    await new Promise((resolve, reject)=>{
      ffmpeg(src)
      .inputOptions([
        '-ss', startTime, // Start time in seconds
        '-t', endTime - startTime, // Duration in seconds
      ])
      .output(mp4OutputFilePath)
      .format('mp4')
      .on('end', () => {
        console.log('GIF creation completed.');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error creating GIF:', err);
        reject(err);
      })
      .on('stderr', (stderrLine) => console.log(stderrLine)) //console log video clipping status
      .run();
    })

    try{
      console.log("======src====");
      console.log(src);
      const koreanTime = moment().tz('Asia/Seoul');
      const currentDate = koreanTime.toISOString();

      const key = `${channelID}/${videoInfo.videoId}/${currentDate}.mp4`;

      const mp4File = fs.createReadStream(mp4OutputFilePath); //reads created Clip
      await uploadClip(mp4File, key); // Upload the file to S3

      fs.unlink(mp4OutputFilePath, (err) => {
        if (err) {
          console.error('로컬 파일 삭제 중 오류 발생:', err);
        } else {
          console.log('로컬 파일 삭제 완료');
        }
      });

      const uploadedFileUrl = `https://${S3_ACCESS.BUCKET}.s3.${S3_ACCESS.REGION}.amazonaws.com/${key}`;
      const encodeUrl = encodeURI(uploadedFileUrl)
      console.log("==encodeUrl==");
      console.log(encodeUrl);

      try{
        const params = {
          TableName: 'Videos',
          KeyConditionExpression: "channelId = :channelId",
          ExpressionAttributeValues: {
            ":channelId": {S : channelID}
          }
        };
        const command = new QueryCommand(params)
        const result = await docClient.send(command)
        console.log(result.Items);
        if (result.Items.length > 0) {
          console.log(result.Items);
        } else{
          const params = {
            TableName: 'Videos',
            Item: {
              channelId: {S: channelID },
              uploadDate: { S: videoInfo.uploadDate },
              videoThumbnail: {S: videoInfo.thumbnail.url},
              videoName: { S: videoInfo.videoTitle },
              videoId: { S: videoInfo.videoId},
            }
          };
          try{
            const command = new PutItemCommand(params);
            await docClient.send(command);
          }catch(err){
            console.log(err);
            return false
          }

        }
      }catch (err) {
        console.error(err);
        return false
      }

      const params = {
        TableName: 'Clips',
        Item: {
          videoId: { S: videoInfo.videoId},
          createDate: { S: currentDate },
          clipLink: { S: uploadedFileUrl },
          startTime: { S: startTime.toString() },
          endTime: { S: endTime.toString() },
          productId: { S: ''},
        }
      };
      try{
        const command = new PutItemCommand(params);
        await docClient.send(command);
      }catch(err){
        console.log(err);
        return false
      }

    }catch(err){
      console.error(err);
      return false
    }


    return true
  }catch(err){
    console.log(err);
    return false
  }
}

exports.createClip = createClip;