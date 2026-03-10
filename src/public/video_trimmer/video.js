let video;
let cnv;
let videoWidth, videoHeight;
let start = false;
let Playing = -1;
let startFrame;
let clipStartTime = 0;
let clipEndTime = 0;
let clipRecords = [];
let sourceVideoUrl = '';
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const encodedUrl = urlParams.get("videoUrl") || '';
const channelID = urlParams.get('channelID') || '';
const videoID = urlParams.get('videoId') || '';
const decodedInfluencer = decodeURIComponent(urlParams.get("influencer") || '');
const decodedVideoName = decodeURIComponent(urlParams.get("videoName") || '');
const directoryName = decodedInfluencer + '/' + decodedVideoName;

const loadingSpinner = document.getElementById('loading-spinner');
const clipsDiv = document.getElementById('clipsDiv');
const reviewStatus = document.getElementById('reviewStatus');
const reviewContent = document.getElementById('reviewContent');
const refreshClipsButton = document.getElementById('refreshClipsButton');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isUrlAvailable(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (_error) {
        return false;
    }
}

async function waitForUrlAvailability(url, maxAttempts = 120) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (await isUrlAvailable(url)) {
            return url;
        }

        await wait(1000);
    }

    throw new Error('소스 영상이 준비되지 않았습니다.');
}

async function getSourceVideoConfig() {
    const response = await fetch(`/videoSource?name=${encodeURIComponent(directoryName)}`);
    if (!response.ok) {
        throw new Error('소스 영상 설정을 불러오지 못했습니다.');
    }

    return response.json();
}

async function requestSourceVideoDownload() {
    const response = await fetch('/videoSource/download', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            videoUrl: encodedUrl,
            name: directoryName,
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || '소스 영상 다운로드를 시작하지 못했습니다.');
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainSeconds = Math.floor(safeSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainSeconds.toString().padStart(2, '0')}`;
}

function formatPrice(price) {
    if (!Number.isFinite(price)) {
        return '가격 정보 없음';
    }

    return `${new Intl.NumberFormat('ko-KR').format(price)}원`;
}

function setReviewStatus(message) {
    reviewStatus.textContent = message;
}

function renderReviewPlaceholder(message) {
    reviewContent.innerHTML = `<p class="emptyState">${escapeHtml(message)}</p>`;
}

function renderClipList(items) {
    clipsDiv.innerHTML = '';

    if (!items.length) {
        clipsDiv.innerHTML = '<p class="emptyState">아직 생성된 클립이 없습니다.</p>';
        return;
    }

    items.forEach((clip, index) => {
        const clipContainer = document.createElement('div');
        clipContainer.classList.add('clipContainer');

        const clipVideo = document.createElement('video');
        clipVideo.src = clip.clipLink;
        clipVideo.controls = true;
        clipVideo.classList.add('clips');

        const meta = document.createElement('div');
        meta.classList.add('clipMeta');

        const clipSpan = document.createElement('span');
        clipSpan.textContent = `#${items.length - index} [${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}]`;
        clipSpan.classList.add('clipSpan');

        meta.appendChild(clipSpan);

        const analyzeButton = document.createElement('button');
        analyzeButton.textContent = '상품 후보 찾기';
        analyzeButton.classList.add('clipButton');
        analyzeButton.addEventListener('click', () => {
            runProductLookup(clip, analyzeButton);
        });

        clipContainer.appendChild(clipVideo);
        clipContainer.appendChild(meta);
        clipContainer.appendChild(analyzeButton);

        clipsDiv.appendChild(clipContainer);
    });
}

async function refreshClipList() {
    if (!videoID) {
        renderClipList([]);
        return [];
    }

    try {
        const response = await fetch(`/clips/${encodeURIComponent(videoID)}`);
        if (!response.ok) {
            throw new Error('클립 목록을 불러오지 못했습니다.');
        }

        const data = await response.json();
        clipRecords = Array.isArray(data) ? data : [];
        renderClipList(clipRecords);
        return clipRecords;
    } catch (error) {
        console.error(error);
        clipsDiv.innerHTML = '<p class="emptyState">클립 목록을 불러오지 못했습니다.</p>';
        return [];
    }
}

async function pollForNewClip(previousCount) {
    setReviewStatus('클립 생성 요청을 보냈습니다. 완료되면 목록에 추가됩니다.');

    for (let attempt = 0; attempt < 20; attempt++) {
        await wait(1500);
        const latestClips = await refreshClipList();
        if (latestClips.length > previousCount) {
            setReviewStatus('새 클립이 준비되었습니다. 상품 후보를 바로 확인할 수 있습니다.');
            return;
        }
    }

    setReviewStatus('클립 생성이 아직 진행 중입니다. 잠시 후 새로고침해 주세요.');
}

function buildReviewHtml(taskDetails, clip) {
    const reviewPayload = taskDetails.task?.result?.reviewPayload
        || taskDetails.steps?.find((step) => step.stepId === 'prepare-review-payload')?.output?.reviewPayload;
    const extraction = reviewPayload?.extraction;

    if (!extraction) {
        return `
            <div class="reviewCard">
                <p class="emptyState">상품 후보를 아직 만들지 못했습니다.</p>
            </div>
        `;
    }

    const selectedProduct = extraction.selectedProduct;
    const shoppingResults = Array.isArray(extraction.shoppingResults) ? extraction.shoppingResults : [];
    const evidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
    const verifierReasons = Array.isArray(extraction.verifier?.reasons) ? extraction.verifier.reasons : [];

    const headline = selectedProduct
        ? `
            <div class="reviewHeadline">
                <p class="reviewName">${escapeHtml(selectedProduct.name)}</p>
                <p class="reviewSub">${escapeHtml(selectedProduct.brand || '브랜드 미확인')} · ${escapeHtml(selectedProduct.category || '카테고리 미확인')}</p>
            </div>
        `
        : '<p class="reviewName">상품 후보 없음</p>';

    const resultsHtml = shoppingResults.length
        ? shoppingResults.slice(0, 3).map((result) => `
            <div class="resultItem">
                <a class="resultLink" href="${escapeHtml(result.productUrl)}" target="_blank" rel="noreferrer">${escapeHtml(result.productName)}</a>
                <p class="resultMeta">${escapeHtml(formatPrice(result.price))} · 리뷰 ${escapeHtml(result.reviewCount)}</p>
            </div>
        `).join('')
        : '<p class="emptyState">쇼핑 결과를 찾지 못했습니다.</p>';

    const evidenceHtml = evidence.length
        ? evidence.slice(0, 3).map((item) => `<p class="evidenceText">${escapeHtml(item.sourceType)}: ${escapeHtml(item.summary)}</p>`).join('')
        : '<p class="emptyState">근거 정보가 없습니다.</p>';

    const warningHtml = verifierReasons.length || extraction.fallbackReason
        ? `
            <p class="warningText">${escapeHtml([
                extraction.fallbackReason ? `fallback=${extraction.fallbackReason}` : '',
                ...verifierReasons,
            ].filter(Boolean).join(', '))}</p>
        `
        : '';

    return `
        <div class="reviewCard">
            <div class="reviewHeadline">
                <p class="reviewSub">클립 구간 ${escapeHtml(formatTime(clip.startTime))} - ${escapeHtml(formatTime(clip.endTime))}</p>
                ${headline}
            </div>
            <span class="reviewBadge">confidence ${escapeHtml(extraction.confidence ?? 0)}</span>
            <div class="resultList">
                ${resultsHtml}
            </div>
            <div class="resultList">
                ${evidenceHtml}
            </div>
            ${warningHtml}
        </div>
    `;
}

async function pollAgentTask(taskId, clip, button) {
    for (let attempt = 0; attempt < 30; attempt++) {
        const response = await fetch(`/agent/tasks/${encodeURIComponent(taskId)}`);
        if (!response.ok) {
            throw new Error('상품 후보 작업 상태를 불러오지 못했습니다.');
        }

        const taskDetails = await response.json();
        const status = taskDetails.task?.status;

        if (status === 'FAILED') {
            throw new Error(taskDetails.task?.error || '상품 후보 분석에 실패했습니다.');
        }

        if (status === 'NEEDS_REVIEW' || status === 'DONE') {
            setReviewStatus('상품 후보 검토 준비가 완료되었습니다.');
            reviewContent.innerHTML = buildReviewHtml(taskDetails, clip);
            button.disabled = false;
            button.textContent = '다시 분석하기';
            return;
        }

        setReviewStatus(`상품 후보를 찾는 중입니다... (${status})`);
        await wait(1500);
    }

    throw new Error('상품 후보 분석 시간이 초과되었습니다.');
}

async function runProductLookup(clip, button) {
    button.disabled = true;
    button.textContent = '분석 중...';
    setReviewStatus('상품 후보를 찾는 중입니다...');
    renderReviewPlaceholder('클립 음성과 메타데이터를 바탕으로 상품 후보를 수집하고 있습니다.');

    try {
        const response = await fetch('/agent/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                taskType: 'AUTO_PRODUCT_FROM_CLIP',
                clipContext: {
                    clipId: clip.createDate || clip.clipLink,
                    clipLink: clip.clipLink,
                    videoId: clip.videoId || videoID,
                    startSec: clip.startTime,
                    endSec: clip.endTime,
                    channelName: decodedInfluencer,
                    videoTitle: decodedVideoName,
                }
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || '상품 후보 작업을 시작하지 못했습니다.');
        }

        const task = await response.json();
        await pollAgentTask(task.taskId, clip, button);
    } catch (error) {
        console.error(error);
        setReviewStatus('상품 후보 분석에 실패했습니다.');
        renderReviewPlaceholder(error.message || '상품 후보 분석에 실패했습니다.');
        button.disabled = false;
        button.textContent = '상품 후보 찾기';
    }
}

async function initializeSourceVideo() {
    try {
        const config = await getSourceVideoConfig();
        sourceVideoUrl = config.url;

        const sourceReady = await isUrlAvailable(sourceVideoUrl);
        if (!sourceReady) {
            if (!config.downloadEnabled) {
                throw new Error('소스 영상 다운로드 트리거가 설정되지 않았습니다.');
            }

            loadingSpinner.style.display = 'block';
            await requestSourceVideoDownload();
        }

        const resolvedUrl = await waitForUrlAvailability(sourceVideoUrl);
        console.log(`Video Downloaded! : ${resolvedUrl}`);
        loadingSpinner.style.display = 'none';
        startLoad(resolvedUrl);
    } catch (error) {
        console.error(`Failed to access URL: ${encodedUrl}`, error);
        loadingSpinner.style.display = 'none';
        setReviewStatus('소스 영상을 준비하지 못했습니다.');
        renderReviewPlaceholder(error.message || '소스 영상을 준비하지 못했습니다.');
    }
}

initializeSourceVideo();


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
    clipEndTime = Number(video.duration().toFixed(2));

    refreshClipList();
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
    renderReviewPlaceholder('클립을 선택하면 상품 후보와 쇼핑 결과가 여기에 표시됩니다.');
    refreshClipsButton.addEventListener('click', refreshClipList);

    function setSecond(event) {
        console.log('time set');
        event.preventDefault();
        if (!video) {
            return;
        }

        let second = parseFloat(secondsInput.value);
        clipStartTime = video.time();
        console.log(second);
        clipEndTime = video.time() + second + 0.01;
    }
    function makeClip(event) {
        event.preventDefault();

        console.log('directoryName: ', directoryName);
        const videoSrcKey = encodeURIComponent(directoryName + '.mp4');

        const clipData = {
            startTime: clipStartTime,
            endTime: clipEndTime,
            videoSrc: videoSrcKey,
            channelId: channelID,
            videoUrl: encodedUrl,
            name: decodedVideoName
        };

        fetch('/clip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clipData)
        })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            pollForNewClip(clipRecords.length);
        })
        .catch((error) => {
            console.error(error);
            setReviewStatus('클립 생성 요청에 실패했습니다.');
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
    let Length = Number(video.duration().toFixed(2));

    let Current = Number(video.time().toFixed(2));
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

    if (!mouseIsPressed && video.time() > clipEndTime) {
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
