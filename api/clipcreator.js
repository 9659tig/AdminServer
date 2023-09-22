const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg'); //video handling package(to clip videos)
const randomID = Math.floor(Math.random()*100000);
const mp4OutputFilePath = `${randomID}.mp4`; //file path to download clip locally(temporary)
const fs = require('fs');
const {uploadClip, uploadJSON} = require('../config/s3')

async function createClip(src, startTime, endTime, key) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);

    try{
    await new Promise((resolve, reject) => {
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
    });
    const mp4File = fs.createReadStream(mp4OutputFilePath); //reads created Clip
    await uploadClip(mp4File, `${key}.mp4`); // Upload the file to S3
    const Json = {time1:startTime,time2: endTime};
    await uploadJSON(JSON.stringify(Json),`${key}.json`);
    fs.unlinkSync(mp4OutputFilePath); // Remove the temporary file
    return 'mp4 creation completed.';
  }catch(error){
    console.error('An error occurred:', error);
      return 'Error creating GIF.';
  }
}

exports.createClip = createClip;