const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg'); //video handling package(to clip videos)
const randomID = Math.floor(Math.random()*100000);
const mp4OutputFilePath = `${randomID}.mp4`; //file path to download clip locally(temporary)
const fs = require('fs');
const {uploadClip} = require('../utils/uploadFunc')
const {PutItemCommand } = require("@aws-sdk/client-dynamodb");
const {S3_ACCESS} = require('../config/secret');
const docClient = require('../config/dynamo');
const moment = require('moment-timezone');

async function createClip(src, startTime, endTime, filename, channelID){
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
      const koreanTime = moment().tz('Asia/Seoul');
      const currentDate = koreanTime.toISOString();

      const sanitizedFilename = filename.replace(/\//g, '_');
      const key = `${channelID}/${sanitizedFilename}_${currentDate}.mp4`;

      const mp4File = fs.createReadStream(mp4OutputFilePath); //reads created Clip
      await uploadClip(mp4File, key); // Upload the file to S3

      const uploadedFileUrl = `https://${S3_ACCESS.BUCKET}.s3.${S3_ACCESS.REGION}.amazonaws.com/${key}`;
      const encodeUrl = encodeURI(uploadedFileUrl)
      console.log(encodeUrl);

      const params = {
        TableName: 'Videos',
        Item: {
          videoLink: { S: encodeUrl },
          createDate: { S: currentDate },
          channelId: {S: channelID },
          videoName: { S: filename },
          startTime: { S: startTime.toString() },
          endTime: { S: endTime.toString() },
          products: { L: [] },
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