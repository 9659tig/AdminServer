let video;
let cnv;
let videoWidth, videoHeight;
let start = false;
let Playing = -1;
let startFrame;
let clipStartTime = 0;
let clipEndTime;

let clipCount = 0;

let clips = [];
function checkUrlAvailability(url) {
    return new Promise((resolve) => {
        fetch(url)
            .then((response) => {
                if (response.status === 200) {
                    resolve(url); // Resolve the promise with the URL if it's accessible
                } else {
                    // Retry after a delay
                    setTimeout(() => checkUrlAvailability(url).then(resolve), 300);
                }
            })
            .catch(() => {
                // Retry after a delay
                setTimeout(() => checkUrlAvailability(url).then(resolve), 300);
            });
    });
}
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const encodedUrl = urlParams.get("videoUrl");
const channelID = urlParams.get('channelID')
const decodedInfluencer = decodeURIComponent(urlParams.get("influencer"));
const decodedVideoName = decodeURIComponent(urlParams.get("videoName"));
const directoryName = decodedInfluencer + '/' + decodedVideoName;


const URL = `https://taewons3.s3.ap-northeast-2.amazonaws.com/${encodeURIComponent(directoryName)}.mp4`;

const loadingSpinner = document.getElementById('loading-spinner');

fetch(URL) //initially check if video is already downloaded on s3
    .then(response => {
        if(response.ok)
            console.log('video preloaded');
        else{
            loadingSpinner.style.display = 'block';
            fetch('https://keixt9i5yc.execute-api.ap-northeast-2.amazonaws.com/default/sam-ytdl-YTDLFunction-QLEz7J3HSLis'+`?videoUrl=${encodedUrl}&name=${encodeURIComponent(directoryName)}`)
        }
    })
    .catch(err=>{ //start downloading it on s3 with aws lambda
        fetch('https://keixt9i5yc.execute-api.ap-northeast-2.amazonaws.com/default/sam-ytdl-YTDLFunction-QLEz7J3HSLis'+`?videoUrl=${encodedUrl}&name=${encodeURIComponent(directoryName)}`)
    })

checkUrlAvailability(URL) //check if download is complete
    .then((resolvedUrl) => {
        console.log(`Video Downloaded! : ${resolvedUrl}`);
        loadingSpinner.style.display = 'none';
        startLoad(URL);
    })
    .catch((error) => {
        console.error(`Failed to access URL: ${encodedUrl}`, error);
    });


function startLoad(url) {
    video = createVideo(url, videoLoaded);
}

function videoLoaded() {
    console.log('Video Loaded');
    video.position(cnv.position().x, cnv.position().y);
    video.loop();
    video.show();
    videoHeight = video.height;
    videoWidth = video.width;
    let ratio = videoWidth / videoHeight;
    if (ratio > 1.2) {
        videoWidth = 800;
        videoHeight = 800 / ratio;
    }
    else {
        videoHeight = 650;
        videoWidth = 650 * ratio;
    }
    resizeCanvas(videoWidth, videoHeight + 25);
    startFrame = frameCount;
    video.hide();
    clipEndTime = video.duration().toFixed(2);

    checkClips('https://taewons3.s3.ap-northeast-2.amazonaws.com/' + encodeURIComponent(directoryName) + '/', 1)
        .then((clips) => {
            console.log(`clips : ${clips}`);
            clipCount = clips;

            try {
                loadClips('https://taewons3.s3.ap-northeast-2.amazonaws.com/' + encodeURIComponent(directoryName) + '/', clipCount, true);
            } catch (err) {
                console.error('error loading clip', err);
            }
        })
        .catch((error) => {
            console.error(`Failed to access URL: ${encodedUrl}`, error);
        });
}


function setup() {
    background(255);

    createCanvasAsync(800, 450, function (createdCnv) {
        cnv = createdCnv;
        const cnvdiv = document.getElementById('cnvDiv');
        cnvdiv.appendChild(cnv.elt);
    });



}

document.addEventListener('DOMContentLoaded', function () {
    const secondsButton = document.getElementById('secondsButton');
    const secondsInput = document.getElementById('secondsInput');
    const makeClipButton = document.getElementById('makeClipButton');
    function setSecond(event) {
        console.log('time set');
        event.preventDefault();
        let second = parseFloat(secondsInput.value);
        clipStartTime = video.time();
        console.log(second);
        clipEndTime = video.time() + second + 0.01;
    }
    function makeClip(event) {
        clipCount++;
        event.preventDefault();

        console.log('directoryName: ', directoryName);
        const URL = encodeURIComponent(directoryName + '.mp4');

        const clipData = {
            startTime: clipStartTime,
            endTime: clipEndTime,
            videoSrc: URL,
            channelId: channelID,
            name: decodedVideoName
        };

        fetch('/influencers/clip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clipData)
        })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            console.log('https://taewons3.s3.ap-northeast-2.amazonaws.com/' + encodeURIComponent(directoryName) + '/' + clipCount + '.mp4');

            checkClips('https://taewons3.s3.ap-northeast-2.amazonaws.com/' + encodeURIComponent(directoryName) + '/', 1)
                .then((clips) => {
                    console.log(`clips : ${clips}`);
                    loadClips('https://taewons3.s3.ap-northeast-2.amazonaws.com/' + encodeURIComponent(directoryName) + '/', clips);
                })
                .catch((error) => {
                    console.error(`URL 접근 실패: ${encodedUrl}`, error);
                });
        });
    }
    makeClipButton.addEventListener('click', makeClip);
    secondsButton.addEventListener('click', setSecond);
})

function createCanvasAsync(width, height, callback) {
    const createdCnv = createCanvas(width, height);
    // Ensure that the canvas is fully initialized before calling the callback
    requestAnimationFrame(() => callback(createdCnv));
}
function draw() {
    background(255);
    textSize(20);
    text("CLICK TO START", width / 2 - 120, height / 2);
    if (start) {
        video.position(cnv.position().x, cnv.position().y);

        image(video, 0, 0, videoWidth, videoHeight);

        if (Playing == -1) {
            const playpauseIcon = document.getElementById('playpauseIcon');
            if (playpauseIcon.classList.contains('fa-pause')) {
                playpauseIcon.classList.replace('fa-pause', 'fa-play');
            }
        } else {
            const playpauseIcon = document.getElementById('playpauseIcon');
            if (playpauseIcon.classList.contains('fa-play')) {
                playpauseIcon.classList.replace('fa-play', 'fa-pause');
            }
        }

        const timeSpan = document.getElementById('timeSpan');
        timeSpan.textContent = toMin(video.time()) + '/' + toMin(video.duration());
        showBar(height - 15);
        //video.speed(playSpeed);
    }
}

function keyReleased() {
    if (start) {
        if (keyCode == 32) { //SPACEBAR
            Playing *= -1;

            if (Playing == 1) {
                video.play();
                console.log("play");
            }

            if (Playing == -1) {
                video.pause();
                console.log("pause");
            }
        }
    }
}


function mouseReleased() {
    var vx = 0;
    var vw = videoWidth;
    var vy = 0;
    var vh = videoHeight;

    if (mouseX > vx && mouseX < vx + vw && mouseY > vy && mouseY < vy + vh) { // if mouse is on video

        Playing *= -1;

        if (Playing == 1) {
            video.play();
            console.log("play");
            if (start == false) {
                start = true;
            }
        }

        if (Playing == -1) {
            video.pause();
            console.log("pause");
        }
    }
}

function showBar(y) { // display video tools bar
    strokeWeight(4);
    stroke(150);
    line(0, y, width, y);
    let Length = video.duration().toFixed(2);

    let Current = video.time().toFixed(2);
    let CurrentX = map(Current, 0, Length, 0, width);


    let startX = map(clipStartTime, 0, Length, 0, width);
    let endX = map(clipEndTime, 0, Length, 0, width);

    stroke(165, 100, 100);
    line(startX, y, endX, y);
    stroke(255, 0, 0);
    line(startX, y, CurrentX, y);

    fill(0);
    stroke(0);
    strokeWeight(2);
    line(startX, y - 4, startX, y + 4);
    line(endX, y - 4, endX, y + 4);
    noStroke();
    fill(255, 0, 0);
    ellipse(CurrentX, y, 8, 8);

    if (!mouseIsPressed & video.time() > clipEndTime) {
        video.time(clipStartTime);
    }

    if (mouseIsPressed && mouseY > video.size().height && mouseY > y - 10 && mouseY < y + 10) {
        if (clipStartTime > video.time()) {
            video.time(clipStartTime + 0.01);
        }
        if (clipEndTime < video.time()) {
            clipEndTime = video.time() + 0.01;
        }

        if (clipEndTime < clipStartTime) {
            let temp = clipEndTime;
            clipEndTime = clipStartTime;
            clipStartTime = temp;
        }
        CurrentX = mouseX;
        let time = map(CurrentX, 0, width, 0, Length);
        video.time(time);

    }

}

function toMin(sec) {
    let Min = floor(sec / 60);
    let Sec = floor(sec % 60);
    Min = Min.toString().padStart(2, '0');
    Sec = Sec.toString().padStart(2, '0');
    return Min + ':' + Sec;
}
function checkUrlAvailability(url) {
    return new Promise((resolve) => {
        fetch(url)
            .then((response) => {
                if (response.status === 200) {
                    resolve(url); // Resolve the promise with the URL if it's accessible
                } else {
                    setTimeout(() => checkUrlAvailability(url).then(resolve), 300); //retry after 300 milisecond
                }
            })
            .catch(() => {
                setTimeout(() => checkUrlAvailability(url).then(resolve), 300);
            });
    });
}



function checkClips(url_till_clipCount, clips) { // check how many clips,, fetch from clip 1 ~ n(unavailable) -> return n-1
    return new Promise((resolve) => {
        fetch(url_till_clipCount + clips + '.mp4')
            .then((response) => {
                if (response.status === 200) {
                    checkClips(url_till_clipCount, clips + 1).then(resolve);
                } else {
                    resolve(clips - 1);
                }
            })
            .catch(() => {
                resolve(clips - 1);
            });
    });
}

function loadClips(url_till_clipCount, clipNum, fromBeginning = false) { // load & display clips on right
    const clipsDiv = document.getElementById('clipsDiv');

    if (fromBeginning) {
        for (let i = 0; i < clipNum; i++) {
            const clipContainer = document.createElement('div');
            clipContainer.classList.add('clipContainer');
            let Video = document.createElement('video');
            Video.src = url_till_clipCount + (i + 1) + '.mp4';
            Video.controls = false;
            Video.classList.add('clips');
            const clipSpan = document.createElement('span');
            clipSpan.textContent = "#" + (i + 1) + " [00:00 - 0:00]";
            clipSpan.classList.add('clipSpan');
            clipContainer.appendChild(Video);
            clipContainer.appendChild(clipSpan);

            clipsDiv.appendChild(clipContainer);
        }
    } else {
        const clipContainer = document.createElement('div');
        clipContainer.classList.add('clipContainer');
        let Video = document.createElement('video');
        Video.src = url_till_clipCount + (clipNum) + '.mp4';
        Video.controls = false;
        Video.classList.add('clips');
        const clipSpan = document.createElement('span');
        clipSpan.textContent = "#" + (clipNum) + " [00:00 - 0:00]";
        clipSpan.classList.add('clipSpan');
        clipContainer.appendChild(Video);
        clipContainer.appendChild(clipSpan);

        clipsDiv.appendChild(clipContainer);
    }
}
