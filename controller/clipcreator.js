const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg'); //video handling package(to clip videos)
const randomID = Math.floor(Math.random()*100000);
const mp4OutputFilePath = `${randomID}.mp4`; //file path to download clip locally(temporary)
const fs = require('fs');
const {uploadClip} = require('../utils/uploadFunc')
const {S3_ACCESS} = require('../config/secret');
const moment = require('moment-timezone');
const {getVideoInfo, addVideoInfo} = require('../service/videos')
const {addClip} = require('../service/clips')

async function createClip(src, startTime, endTime, channelID, videoInfo){
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

      console.log(videoInfo);
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

      try{
        const videoList = await getVideoInfo(channelID)
        if (videoList.length > 0){
          try{
            await addVideoInfo(channelID, videoInfo)
          }catch(err){
            throw err
          }
        }
      }catch (err) {
        throw err
      }

      try{
        await addClip(videoInfo.videoId, currentDate, encodeUrl, startTime.toString(), endTime.toString())
        console.log("클립 저장 완료");
      }catch(err){
        throw err
      }
    }catch(err){
      throw err
    }

    return true;
  }catch(err){
    throw err
  }
}

exports.createClip = createClip;