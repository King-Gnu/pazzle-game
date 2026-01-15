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
let isRunning = false;
let stepToken = 0;
let waitingResolve = null;
let runToken = 0;

// ========================================
// 描画テーマ（プレイページのダークテーマに合わせる）
// ========================================
const theme = {
    cell: '#3a4a5a',
    grid: '#4a5a6a',
    obstacle: '#2d2d44',
    obstacleBorder: '#1e1e33',
    obstacleX: '#8888aa',
    path: '#5cc9f5',
    head: '#66bb6a',
    visited: 'rgba(92, 201, 245, 0.28)',
    backtrack: 'rgba(239, 83, 80, 0.25)',
    boardBg: '#1c2038',
};

// ========================================
// ユーティリティ
// ========================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDelayMs() {
    const v = Number(speedRange.value); // 0=速, 100=遅
    const max = 260;
    const min = 1;
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

function resetState(options = {}) {
    const { keepPlayback = false } = options;
    cellState = Array(n).fill(0).map(() => Array(n).fill(0));
    currentPath = [];
    currentHead = null;
    if (!keepPlayback) {
        isPlaying = false;
        isRunning = false;
    }
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
    ctx.fillStyle = theme.boardBg;
    ctx.fillRect(offsetX - 6, offsetY - 6, size + 12, size + 12);

    // マス描画（プレイページと同じ配色）
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const px = offsetX + x * cellSize;
            const py = offsetY + y * cellSize;
            if (board[y][x] === 1) {
                // 障害物
                ctx.fillStyle = theme.obstacle;
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = theme.obstacleBorder;
                ctx.strokeRect(px, py, cellSize, cellSize);

                // ×印
                ctx.strokeStyle = theme.obstacleX;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px + 10, py + 10);
                ctx.lineTo(px + cellSize - 10, py + cellSize - 10);
                ctx.moveTo(px + cellSize - 10, py + 10);
                ctx.lineTo(px + 10, py + cellSize - 10);
                ctx.stroke();
                ctx.lineWidth = 1;
            } else {
                ctx.fillStyle = theme.cell;
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = theme.grid;
                ctx.strokeRect(px, py, cellSize, cellSize);
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
                ctx.fillStyle = theme.visited;
            } else {
                ctx.fillStyle = theme.backtrack;
            }
            ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
        }
    }

    // パス線
    if (currentPath.length >= 2) {
        ctx.strokeStyle = theme.path;
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
        ctx.fillStyle = theme.head;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(4, cellSize * 0.2), 0, Math.PI * 2);
        ctx.fill();
    }
}

// ========================================
// 探索実行
// ========================================
async function startVisualization({ autoPlay = false } = {}) {
    runToken++;
    const token = runToken;
    resetState({ keepPlayback: true });
    isPlaying = autoPlay;
    isRunning = true;
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
    try {
        const result = await solver.solveAsync();

        if (token !== runToken) return;

        if (result) {
            updateStatus(`完了: パス長 ${result.length}`);
        } else {
            updateStatus('失敗: 解が見つかりませんでした');
        }
    } finally {
        if (token === runToken) {
            isRunning = false;
            isPlaying = false;
        }
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
    if (!isRunning) {
        startVisualization({ autoPlay: true });
        updateStatus('再生中...');
        return;
    }
    if (!isPlaying) {
        isPlaying = true;
        updateStatus('再生中...');
        wakeGate();
    }
});

pauseBtn.addEventListener('click', () => {
    isPlaying = false;
    updateStatus('一時停止');
});

stepBtn.addEventListener('click', () => {
    if (!isRunning) {
        startVisualization({ autoPlay: false });
        stepToken++;
        wakeGate();
        updateStatus('ステップ実行');
        return;
    }
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
