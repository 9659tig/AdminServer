//const ffmpeg = require('fluent-ffmpeg'); //video handling package(to clip videos)

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import moment from 'moment-timezone';
import { uploadClip } from '../utils/uploadFunc'
import { S3_ACCESS } from '../config/secret';
import { getVideoInfo, addVideoInfo } from '../service/videos'
import { addClip } from '../service/clips'

interface VideoInfo {
  videoId:string;
  uploadDate:string;
  thumbnail:string;
  videoTitle:string;
  viewCount:string;
  videoTag:string;
  videoTime: string;
}

async function createClip(src: string, startTime: number, endTime: number, channelID: string, videoInfo: VideoInfo): Promise<boolean>{
  const randomID = Math.floor(Math.random()*100000);
  const mp4OutputFilePath = `${randomID}.mp4`; //file path to download clip locally(temporary)

  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  try{
    await new Promise<void>((resolve, reject)=>{
      ffmpeg(src)
      .inputOptions([
        '-ss', startTime.toString(), // Start time in seconds
        '-t', (endTime - startTime).toString(), // Duration in seconds
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

      //console.log(videoInfo);
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
        const videoList = await getVideoInfo(channelID, videoInfo.videoId)

        if (videoList && videoList.length === 0){
          try{
            await addVideoInfo(channelID, videoInfo)
          }catch(err){
            throw err
          }
        }else{
          console.log("비디오 정보 존재");
        }
      }catch (err) {
        throw err
      }

      try{
        await addClip(videoInfo.videoId, currentDate, encodeUrl, startTime.toString(), endTime.toString(), videoInfo.videoTime)
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

export {createClip};
