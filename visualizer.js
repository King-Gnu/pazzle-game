/*
 * 一筆書きパズル - 探索可視化スクリプト
 * - FastHamiltonSolver / SmartPathGenerator の探索を可視化
 * - onStep フックで訪問/バックトラックを描画
 */

// ========================================
// グローバル（puzzle-generator.js が参照）
// ========================================
var n = 8;
var board = [];

// ========================================
// UI要素
// ========================================
const sizeSelect = document.getElementById('sizeSelect');
const speedRange = document.getElementById('speedRange');
const speedLabel = document.getElementById('speedLabel');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stepBtn = document.getElementById('stepBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('boardCanvas');
const ctx = canvas.getContext('2d');

// ========================================
// 可視化状態
// ========================================
let cellState = []; // 0:未訪問, 1:訪問中, 2:バックトラック済み
let currentPath = [];
let currentHead = null;
let isPlaying = false;
let stepToken = 0;
let waitingResolve = null;
let runToken = 0;

// ========================================
// ユーティリティ
// ========================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDelayMs() {
    const v = Number(speedRange.value); // 0=速, 100=遅
    const max = 260;
    const min = 10;
    const ms = Math.round(max - (v / 100) * (max - min));
    speedLabel.textContent = `待機: ${ms}ms`;
    return ms;
}

function updateStatus(text) {
    statusEl.textContent = text;
}

function initBoard(size) {
    n = size;
    board = Array(n).fill(0).map(() => Array(n).fill(0));
}

function placeObstacles() {
    // 既存の配置ロジックを利用
    const target = getRandomInitialObstacles(n);
    const placed = placeObstaclesWithDegreeCheck(board, target);
    if (placed < target * 0.6) {
        // 失敗時の保険（完全ランダムで埋める）
        placeObstaclesRandom(board, target);
    }
}

function resetState() {
    cellState = Array(n).fill(0).map(() => Array(n).fill(0));
    currentPath = [];
    currentHead = null;
    isPlaying = false;
    stepToken = 0;
    waitingResolve = null;
}

function applyStep(state) {
    if (!state || state.n !== n) return;

    if (state.type === 'visit' || state.type === 'start') {
        cellState[state.y][state.x] = 1;
        currentHead = [state.y, state.x];
    } else if (state.type === 'backtrack') {
        cellState[state.y][state.x] = 2; // 赤く残す
    } else if (state.type === 'deadend' || state.type === 'contradiction') {
        // 行き止まりは薄く赤で残す
        cellState[state.y][state.x] = 2;
    }

    currentPath = state.path ? state.path.slice() : currentPath;
}

async function waitGate() {
    while (!isPlaying && stepToken === 0) {
        await new Promise(resolve => { waitingResolve = resolve; });
        waitingResolve = null;
    }
    if (stepToken > 0) stepToken--;
}

function wakeGate() {
    if (waitingResolve) waitingResolve();
}

// ========================================
// 描画
// ========================================
function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padding = 16;
    const size = Math.min(w, h) - padding * 2;
    const cellSize = size / n;
    const offsetX = (w - size) / 2;
    const offsetY = (h - size) / 2;

    // 背景
    ctx.fillStyle = '#141833';
    ctx.fillRect(offsetX - 6, offsetY - 6, size + 12, size + 12);

    // グリッド
    ctx.strokeStyle = '#2e3357';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
        const x = offsetX + i * cellSize;
        const y = offsetY + i * cellSize;
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + size);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + size, y);
        ctx.stroke();
    }

    // 障害物
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y][x] === 1) {
                const px = offsetX + x * cellSize;
                const py = offsetY + y * cellSize;
                ctx.fillStyle = '#1f2244';
                ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
            }
        }
    }

    // 訪問・バックトラック
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const state = cellState[y][x];
            if (state === 0 || board[y][x] === 1) continue;
            const px = offsetX + x * cellSize;
            const py = offsetY + y * cellSize;
            if (state === 1) {
                ctx.fillStyle = 'rgba(90, 167, 255, 0.35)';
            } else {
                ctx.fillStyle = 'rgba(255, 90, 122, 0.35)';
            }
            ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
        }
    }

    // パス線
    if (currentPath.length >= 2) {
        ctx.strokeStyle = 'rgba(93, 255, 182, 0.9)';
        ctx.lineWidth = Math.max(2, cellSize * 0.12);
        ctx.lineCap = 'round';
        ctx.beginPath();
        currentPath.forEach(([y, x], i) => {
            const cx = offsetX + x * cellSize + cellSize / 2;
            const cy = offsetY + y * cellSize + cellSize / 2;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
    }

    // ヘッド
    if (currentHead) {
        const [hy, hx] = currentHead;
        const cx = offsetX + hx * cellSize + cellSize / 2;
        const cy = offsetY + hy * cellSize + cellSize / 2;
        ctx.fillStyle = '#5dffb6';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, cellSize * 0.2), 0, Math.PI * 2);
        ctx.fill();
    }
}

// ========================================
// 探索実行
// ========================================
async function startVisualization() {
    runToken++;
    const token = runToken;

    resetState();
    initBoard(Number(sizeSelect.value));
    placeObstacles();
    draw();

    updateStatus('探索開始...');

    const onStep = async (state) => {
        if (token !== runToken) return; // リセット後の古いステップを無視
        applyStep(state);
        draw();

        if (!isPlaying) {
            await waitGate();
            if (token !== runToken) return;
        } else {
            await sleep(getDelayMs());
        }
    };

    // FastHamiltonSolver を使って探索の動きを可視化
    const solver = new FastHamiltonSolver(n, board, onStep);
    const result = await solver.solveAsync();

    if (token !== runToken) return;

    if (result) {
        updateStatus(`完了: パス長 ${result.length}`);
    } else {
        updateStatus('失敗: 解が見つかりませんでした');
    }
}

// ========================================
// イベント
// ========================================
sizeSelect.addEventListener('change', () => {
    runToken++;
    resetState();
    initBoard(Number(sizeSelect.value));
    placeObstacles();
    draw();
    updateStatus('サイズ変更: リセット済み');
});

speedRange.addEventListener('input', () => {
    getDelayMs();
});

playBtn.addEventListener('click', () => {
    if (!isPlaying) {
        isPlaying = true;
        updateStatus('再生中...');
        wakeGate();
    }
    if (runToken === 0) startVisualization();
});

pauseBtn.addEventListener('click', () => {
    isPlaying = false;
    updateStatus('一時停止');
});

stepBtn.addEventListener('click', () => {
    if (runToken === 0) startVisualization();
    stepToken++;
    wakeGate();
    updateStatus('ステップ実行');
});

resetBtn.addEventListener('click', () => {
    runToken++;
    resetState();
    initBoard(Number(sizeSelect.value));
    placeObstacles();
    draw();
    updateStatus('リセット完了');
});

// 初期描画
initBoard(Number(sizeSelect.value));
placeObstacles();
getDelayMs();
draw();
updateStatus('準備完了');
