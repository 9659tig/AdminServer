const {google} = require('googleapis'); // google 객체 가져와 YouTube Data Api 호출
require('dotenv').config(); // 환경변수 로드 -> Google Api 키 가져옴

const {GOOGLE_API_KEY} = require('../config/secret')
const youtube = google.youtube({
    version: 'v3',
    auth: GOOGLE_API_KEY,
}); // => google.youtube 객체 생성하여 YouTUbe Api 사용

// 특정 YouTube 채널의 정보를 가져오는 기능을 수행
async function getChannelInfo(channelID){
    try {
        // youTube API의 channels.list 메서드를 호출하여 채널 정보를 가져옴
        const result = await youtube.channels.list({
            // snippet : YouTube 채널의 기본 정보 -> 채널의 제목, 설명, 공개 날짜, 국가 등
            // statistics :  채널의 총 비디오 수, 구독자 수, 총 조회수 등의 통계 정보
            // contentDetails : 채널의 비디오 업로드 정책, 관련된 플레이리스트, 채널 ID, 라이브 방송 설정 등
            // brandingSettings : 채널 아이콘, 배경 이미지, 채널 커버 아트 등의 브랜딩 관련 이미지 URL 및 기타 브랜딩 관련 설정
            part: 'snippet, statistics, contentDetails, brandingSettings',
            id: channelID //youtube channel ID
        })

        const channelData = result.data.items[0];
        if(channelData){
            return channelData;
        }else{
            return 'channel not found';
        }
    }
    catch(err){
        throw err
    }
}

exports.getChannelInfo = getChannelInfo;