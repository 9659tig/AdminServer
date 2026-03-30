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

        const candidates = extractCandidateResults(data);
        if (candidates.length === 0) return;

        reviewPanel.hidden = false;
        renderCandidateGroups(candidates);
    } catch (_) {}
}

function extractCandidateResults(evidence) {
    if (!evidence || typeof evidence !== 'object') return [];
    const extraction = evidence.extraction || {};
    if (Array.isArray(extraction.candidateResults) && extraction.candidateResults.length > 0) {
        return extraction.candidateResults;
    }
    // fallback: 기존 shoppingResults 평면 구조 (하위 호환)
    if (Array.isArray(extraction.shoppingResults) && extraction.shoppingResults.length > 0) {
        return [{
            candidate: extraction.selectedProduct || { name: '상품 후보', confidence: 0 },
            shoppingResults: extraction.shoppingResults,
            evidence: extraction.evidence || [],
            confidence: extraction.confidence || 0,
        }];
    }
    return [];
}

function renderCandidateGroups(candidateResults) {
    productList.innerHTML = '';
    candidateResults.forEach((cr, idx) => {
        if (!productDecisions[idx]) {
            productDecisions[idx] = {
                decision: 'pending',
                selectedShoppingRank: cr.shoppingResults[0]?.rank ?? null,
            };
        }

        const group = document.createElement('div');
        group.className = 'candidate-group ' + productDecisions[idx].decision;
        group.dataset.idx = idx;

        const brandText = cr.candidate.brand ? ` (${escHtml(cr.candidate.brand)})` : '';
        const conf = typeof cr.confidence === 'number' ? cr.confidence.toFixed(2) : '?';

        let shoppingHtml = '';
        if (cr.shoppingResults.length > 0) {
            const radioName = `shopping-${idx}`;
            shoppingHtml = '<div class="shopping-list">' + cr.shoppingResults.map((s) => {
                const checked = s.rank === productDecisions[idx].selectedShoppingRank ? 'checked' : '';
                const selected = checked ? ' selected' : '';
                const price = s.price ? `₩${Number(s.price).toLocaleString()}` : '';
                const source = s.source === 'naver' ? '네이버' : s.source === 'coupang' ? '쿠팡' : '';
                const meta = [price, source].filter(Boolean).join(' · ');
                const link = s.productUrl
                    ? `<a class="shopping-item-link" href="${escHtml(s.productUrl)}" target="_blank" rel="noopener">보기↗</a>`
                    : '';
                return `<label class="shopping-item${selected}">
                    <input type="radio" name="${radioName}" value="${s.rank}" ${checked} data-idx="${idx}" data-rank="${s.rank}">
                    <div class="shopping-item-info">
                        <div class="shopping-item-name">${escHtml(s.productName)}</div>
                        <div class="shopping-item-meta">${escHtml(meta)}</div>
                    </div>
                    ${link}
                </label>`;
            }).join('') + '</div>';
        } else {
            shoppingHtml = '<div class="no-shopping">쇼핑 결과 없음</div>';
        }

        group.innerHTML = `
            <div class="candidate-header">
                <div>
                    <p class="candidate-name">${escHtml(cr.candidate.name)}${brandText}</p>
                    <span class="candidate-meta">${escHtml(cr.candidate.category || '')}</span>
                </div>
                <span class="candidate-confidence">${conf}</span>
            </div>
            ${shoppingHtml}
            <div class="candidate-btns">
                <button class="approve-btn" data-idx="${idx}">승인</button>
                <button class="reject-btn" data-idx="${idx}">거절</button>
            </div>`;

        productList.appendChild(group);
    });

    // 승인/거절 버튼 이벤트
    productList.querySelectorAll('.candidate-btns .approve-btn').forEach((btn) => {
        btn.addEventListener('click', () => setCandidateDecision(Number(btn.dataset.idx), 'approved'));
    });
    productList.querySelectorAll('.candidate-btns .reject-btn').forEach((btn) => {
        btn.addEventListener('click', () => setCandidateDecision(Number(btn.dataset.idx), 'rejected'));
    });

    // 라디오 버튼 이벤트
    productList.querySelectorAll('input[type="radio"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            const idx = Number(radio.dataset.idx);
            const rank = Number(radio.dataset.rank);
            if (productDecisions[idx]) {
                productDecisions[idx].selectedShoppingRank = rank;
            }
            // 선택 시각화 업데이트
            const group = productList.querySelector(`[data-idx="${idx}"]`);
            if (group) {
                group.querySelectorAll('.shopping-item').forEach((item) => item.classList.remove('selected'));
                radio.closest('.shopping-item').classList.add('selected');
            }
        });
    });
}

function setCandidateDecision(idx, decision) {
    if (productDecisions[idx]) {
        productDecisions[idx].decision = decision;
    }
    const group = productList.querySelector(`[data-idx="${idx}"]`);
    if (group) {
        group.className = 'candidate-group ' + decision;
    }
}

// ── 전체 승인/거절 ────────────────────────────────────
approveAllBtn.addEventListener('click', () => {
    Object.keys(productDecisions).forEach((k) => setCandidateDecision(Number(k), 'approved'));
});
rejectAllBtn.addEventListener('click', () => {
    Object.keys(productDecisions).forEach((k) => setCandidateDecision(Number(k), 'rejected'));
});

// ── 검토 제출 ─────────────────────────────────────────
submitReviewBtn.addEventListener('click', async () => {
    if (!currentTaskId) return;

    const approved = Object.entries(productDecisions)
        .filter(([, v]) => v.decision === 'approved')
        .map(([k, v]) => ({
            candidateIndex: Number(k),
            ...(v.selectedShoppingRank != null ? { shoppingRank: v.selectedShoppingRank } : {}),
        }));

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
