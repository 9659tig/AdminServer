'use strict';

// ── 상태 ──────────────────────────────────────────────
let currentFile = null;
let currentTaskId = null;
let pollTimer = null;
// 상품별 승인 상태: { [rank]: 'approved' | 'rejected' | 'pending' }
let productDecisions = {};

// ── DOM 참조 ──────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('file-input');
const dropLabel      = document.getElementById('drop-label');
const fileSelected   = document.getElementById('file-selected');
const fileNameEl     = document.getElementById('file-name');
const videoTitleEl   = document.getElementById('video-title');
const channelNameEl  = document.getElementById('channel-name');
const channelCatEl   = document.getElementById('channel-category');
const submitBtn      = document.getElementById('submit-btn');

const uploadPanel    = document.getElementById('upload-panel');
const taskPanel      = document.getElementById('task-panel');
const backBtn        = document.getElementById('back-btn');
const taskIdDisplay  = document.getElementById('task-id-display');
const taskStatusBadge= document.getElementById('task-status-badge');
const stepList       = document.getElementById('step-list');

const reviewPanel    = document.getElementById('review-panel');
const productList    = document.getElementById('product-list');
const approveAllBtn  = document.getElementById('approve-all-btn');
const rejectAllBtn   = document.getElementById('reject-all-btn');
const reviewComment  = document.getElementById('review-comment');
const submitReviewBtn= document.getElementById('submit-review-btn');
const retryBtn       = document.getElementById('retry-btn');

const failedPanel    = document.getElementById('failed-panel');
const errorMsg       = document.getElementById('error-msg');
const retryFailedBtn = document.getElementById('retry-failed-btn');

// ── 파일 선택 ─────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
        setFile(fileInput.files[0]);
    }
});
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) setFile(f);
});

function setFile(file) {
    currentFile = file;
    fileNameEl.textContent = file.name;
    dropLabel.hidden = true;
    fileSelected.hidden = false;
    submitBtn.disabled = false;
}

// ── 업로드 및 태스크 생성 ─────────────────────────────
submitBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    const fd = new FormData();
    fd.append('videoFile', currentFile);
    if (videoTitleEl.value.trim())   fd.append('videoTitle',       videoTitleEl.value.trim());
    if (channelNameEl.value.trim())  fd.append('channelName',      channelNameEl.value.trim());
    if (channelCatEl.value.trim())   fd.append('channelCategory',  channelCatEl.value.trim());

    submitBtn.disabled = true;
    submitBtn.innerHTML = '업로드 중… <span class="spinner"></span>';

    try {
        const res = await fetch('/agent/video/extract', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        currentTaskId = data.taskId;
        showTaskPanel(currentTaskId);
        startPolling(currentTaskId);
    } catch (err) {
        alert('업로드 실패: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '분석 시작';
    }
});

// ── 패널 전환 ─────────────────────────────────────────
function showTaskPanel(taskId) {
    uploadPanel.hidden = true;
    taskPanel.hidden = false;
    taskIdDisplay.textContent = taskId;
    reviewPanel.hidden = true;
    failedPanel.hidden = true;
    stepList.innerHTML = '';
    productList.innerHTML = '';
    productDecisions = {};
    submitReviewBtn.disabled = false;
    reviewComment.value = '';
    // 이전 검토 완료 메시지 제거
    taskPanel.querySelectorAll('p.done-msg').forEach((el) => el.remove());
}

backBtn.addEventListener('click', () => {
    stopPolling();
    uploadPanel.hidden = false;
    taskPanel.hidden = true;
    // 폼 초기화
    currentFile = null;
    currentTaskId = null;
    fileInput.value = '';
    dropLabel.hidden = false;
    fileSelected.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '분석 시작';
});

// ── 폴링 ─────────────────────────────────────────────
function startPolling(taskId) {
    stopPolling();
    pollTimer = setInterval(() => pollTask(taskId), 3000);
    pollTask(taskId);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollTask(taskId) {
    try {
        const res = await fetch(`/agent/tasks/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();
        renderTaskStatus(data);

        const status = data.task ? data.task.status : data.status;
        if (status === 'NEEDS_REVIEW' || status === 'FAILED' || status === 'DONE') {
            stopPolling();
        }
    } catch (_) { /* 일시적 네트워크 오류 무시 */ }
}

// ── 태스크 상태 렌더 ──────────────────────────────────
function renderTaskStatus(data) {
    const task   = data.task || data;
    const status = task.status;

    taskStatusBadge.textContent  = statusLabel(status);
    taskStatusBadge.className    = 'badge ' + statusClass(status);

    // 스텝 목록
    if (Array.isArray(task.steps)) {
        stepList.innerHTML = task.steps.map((s) => `
            <div class="step-item">
                <span class="step-icon">${stepIcon(s.status)}</span>
                <span class="step-name">${s.stepId}</span>
                <span class="step-status">${s.status}</span>
            </div>`).join('');
    }

    // 상태별 하단 패널
    if (status === 'NEEDS_REVIEW') {
        loadEvidence(task.taskId || currentTaskId);
    } else if (status === 'FAILED') {
        reviewPanel.hidden = true;
        failedPanel.hidden = false;
        errorMsg.textContent = task.error || '알 수 없는 오류가 발생했습니다.';
    }
}

// ── Evidence(상품 결과) 로드 ──────────────────────────
async function loadEvidence(taskId) {
    try {
        const res = await fetch(`/agent/tasks/${taskId}/evidence`);
        if (!res.ok) return;
        const data = await res.json();

        const products = extractProducts(data);
        if (products.length === 0) return;

        reviewPanel.hidden = false;
        renderProducts(products);
    } catch (_) {}
}

function extractProducts(evidence) {
    if (!evidence || typeof evidence !== 'object') return [];

    // 실제 구조: { extraction: { shoppingResults, allCandidates }, ... }
    const extraction = evidence.extraction || {};

    // 1순위: 쇼핑 검색 결과 (가격·링크 포함)
    if (Array.isArray(extraction.shoppingResults) && extraction.shoppingResults.length > 0) {
        return extraction.shoppingResults;
    }

    // 2순위: vision 후보 (쇼핑 결과 없을 때)
    if (Array.isArray(extraction.allCandidates) && extraction.allCandidates.length > 0) {
        return extraction.allCandidates.map((c, i) => ({
            productName: c.name,
            productUrl: '',
            price: undefined,
            reviewCount: 0,
            imageUrl: undefined,
            rank: i + 1,
            source: 'vision',
        }));
    }

    return [];
}

function renderProducts(products) {
    productList.innerHTML = '';
    products.forEach((p, i) => {
        const key = p.rank ?? i;
        if (!productDecisions[key]) productDecisions[key] = 'pending';

        const card = document.createElement('div');
        card.className = 'product-card ' + productDecisions[key];
        card.dataset.key = key;

        const thumb = p.imageUrl
            ? `<img class="product-thumb" src="${p.imageUrl}" alt="" onerror="this.style.display='none'">`
            : `<div class="product-thumb-placeholder">&#128248;</div>`;

        const price = p.price ? `₩${Number(p.price).toLocaleString()}` : '가격 정보 없음';
        const reviews = p.reviewCount ? `리뷰 ${p.reviewCount.toLocaleString()}개` : '';
        const sourceName = p.source === 'naver' ? '네이버' : p.source === 'coupang' ? '쿠팡' : '';
        const meta = [price, reviews, sourceName].filter(Boolean).join(' · ');
        const linkHtml = p.productUrl
            ? `<a class="product-link" href="${escHtml(p.productUrl)}" target="_blank" rel="noopener">상품 보기 &#8599;</a>`
            : '';

        card.innerHTML = `
            ${thumb}
            <div class="product-info">
                <p class="product-name">${escHtml(p.productName)}</p>
                <p class="product-meta">${escHtml(meta)}</p>
                ${linkHtml}
            </div>
            <div class="card-btns">
                <button class="approve-btn card-approve" data-key="${key}">승인</button>
                <button class="reject-btn card-reject"  data-key="${key}">거절</button>
            </div>`;

        productList.appendChild(card);
    });

    // 개별 카드 버튼
    productList.querySelectorAll('.card-approve').forEach((btn) => {
        btn.addEventListener('click', () => setDecision(btn.dataset.key, 'approved'));
    });
    productList.querySelectorAll('.card-reject').forEach((btn) => {
        btn.addEventListener('click', () => setDecision(btn.dataset.key, 'rejected'));
    });
}

function setDecision(key, decision) {
    productDecisions[key] = decision;
    const card = productList.querySelector(`[data-key="${key}"]`);
    if (card) {
        card.className = 'product-card ' + decision;
    }
}

// ── 전체 승인/거절 ────────────────────────────────────
approveAllBtn.addEventListener('click', () => {
    Object.keys(productDecisions).forEach((k) => setDecision(k, 'approved'));
});
rejectAllBtn.addEventListener('click', () => {
    Object.keys(productDecisions).forEach((k) => setDecision(k, 'rejected'));
});

// ── 검토 제출 ─────────────────────────────────────────
submitReviewBtn.addEventListener('click', async () => {
    if (!currentTaskId) return;

    const approved = Object.entries(productDecisions)
        .filter(([, v]) => v === 'approved')
        .map(([k]) => Number(k));

    const payload = {
        approved,
        comment: reviewComment.value.trim() || undefined,
    };

    submitReviewBtn.disabled = true;
    try {
        const res = await fetch(`/agent/tasks/${currentTaskId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        const status = data.task ? data.task.status : 'DONE';
        taskStatusBadge.textContent = statusLabel(status);
        taskStatusBadge.className   = 'badge ' + statusClass(status);
        reviewPanel.hidden = true;

        const done = document.createElement('p');
        done.className = 'done-msg';
        done.style.cssText = 'color:#15803d;font-weight:600;margin-top:1rem;';
        done.textContent = '검토가 완료되었습니다.';
        taskPanel.appendChild(done);
    } catch (err) {
        alert('제출 실패: ' + err.message);
        submitReviewBtn.disabled = false;
    }
});

// ── 재실행 ────────────────────────────────────────────
retryBtn.addEventListener('click', () => doRetry());
retryFailedBtn.addEventListener('click', () => doRetry());

async function doRetry() {
    if (!currentTaskId) return;
    try {
        await fetch(`/agent/tasks/${currentTaskId}/retry`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: '{}' });
        reviewPanel.hidden = true;
        failedPanel.hidden = true;
        stepList.innerHTML = '';
        startPolling(currentTaskId);
    } catch (err) {
        alert('재실행 실패: ' + err.message);
    }
}

// ── 헬퍼 ─────────────────────────────────────────────
function statusLabel(s) {
    return { PENDING: '대기중', RUNNING: '분석중', NEEDS_REVIEW: '검토 필요',
             DONE: '완료', FAILED: '실패' }[s] || s;
}
function statusClass(s) {
    return { PENDING: 'badge-pending', RUNNING: 'badge-running',
             NEEDS_REVIEW: 'badge-review', DONE: 'badge-done', FAILED: 'badge-failed' }[s] || '';
}
function stepIcon(s) {
    return { PENDING: '○', RUNNING: '⟳', DONE: '✓', FAILED: '✕' }[s] || '·';
}
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
