// 1筆書きマスパズル main.js
let n = 6; // 盤面サイズ（デフォルト6x6）
let cellSize = 70;
let boardPadding = 20;
let obstacleCount = 0; // お邪魔マス数（初期起動時にランダム設定）
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');
const resetBtn = document.getElementById('reset-btn');
const hintBtn = document.getElementById('hint-btn');
const regenerateBtn = document.getElementById('regenerate-btn');
const sizeSelect = document.getElementById('size-select');
const obstacleInput = document.getElementById('obstacle-input');
const obstacleMaxEl = document.getElementById('obstacle-max');
const difficultyValueEl = document.getElementById('difficulty-value');
const difficultyFillEl = document.getElementById('difficulty-fill');
const copyPuzzleBtn = document.getElementById('copy-puzzle-btn');
const loadPuzzleBtn = document.getElementById('load-puzzle-btn');
const generateWithSettingsBtn = document.getElementById('generate-with-settings-btn');
const themeBtn = document.getElementById('theme-btn');

// 問題共有モーダル要素
const shareModal = document.getElementById('share-modal');
const shareOverlay = document.getElementById('share-overlay');
const shareModalTitle = document.getElementById('share-modal-title');
const shareCodeInput = document.getElementById('share-code-input');
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareLoadBtn = document.getElementById('share-load-btn');
const shareCloseBtn = document.getElementById('share-close-btn');

// ルールモーダル要素
const ruleBtn = document.getElementById('rule-btn');
const ruleModal = document.getElementById('rule-modal');
const ruleOverlay = document.getElementById('rule-overlay');
const closeRuleBtn = document.getElementById('close-rule-btn');

// 正解ルート（解答を先に作成）
let solutionPath = null;

// 盤面データ: 0=通行可能, 1=☒マス
let board = [];

// スタートとゴール [y, x]
let startPos = null;
let goalPos = null;

// 線を引いた経路（[y, x]の配列）
let path = [];
let isDrawing = false;
let gameCleared = false;
let isGenerating = false;
let generationFailed = false; // 生成失敗状態
let isDarkTheme = false; // ダークテーマ状態

// クリック（タッチ）中に指しているマス（丸印表示用）
let activePointerCell = null;

function getMinObstaclesForSize(size) {
    const table = {
        6: 4,
        7: 6,
        8: 8,
        9: 10,
        10: 12,
    };
    // 未定義サイズは「サイズに比例して増える」ようにする
    return table[size] ?? Math.max(0, Math.floor(size * 1.2));
}

function getRandomInitialObstacles(size) {
    // 合計マスの1割～2割の範囲でランダムに設定
    const totalCells = size * size;
    const minPercent = Math.ceil(totalCells * 0.1);   // 1割
    const maxPercent = Math.floor(totalCells * 0.2);  // 2割

    // 制約との整合性を取る
    const minObs = getMinObstaclesForSize(size);
    const maxNoBand = getNoBandConstraints(size, maxPercent).maxObstaclesNoBand;
    const maxObs = Math.min(maxPercent, maxNoBand, totalCells - 2);

    const lower = Math.max(minObs, minPercent);
    const upper = Math.max(lower, maxObs);

    // lower ～ upper の範囲でランダム
    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function getNoBandConstraints(size, obstacles, relaxLevel = 0) {
    // 「上下帯」のような偏りを絶対に出さないための制約
    // - 各行/列に最低k個の通行可能マスを残す
    // - 障害の連続（横/縦）が長すぎるものを禁止
    // - 外周への偏りを禁止（外周セル比率より少なく抑える）
    // relaxLevel: 0=厳格, 1=やや緩和, 2=緩和, 3=最大緩和
    const minPassablePerLine = 2;
    const baseMaxRun = Math.max(3, Math.floor(size * 0.6));
    const maxObstacleRun = baseMaxRun + relaxLevel; // 緩和で連続許容を増やす

    const totalCells = size * size;
    const outerCells = size === 1 ? 1 : (size * 4 - 4);
    const expectedOuter = obstacles * (outerCells / totalCells);

    // 緩和レベルに応じて外周制限を調整
    const outerRatios = [0.7, 0.85, 1.0, 1.2]; // relaxLevel 0,1,2,3
    const outerRatio = outerRatios[Math.min(relaxLevel, outerRatios.length - 1)];
    const outerMin = 0;
    const outerMax = Math.min(obstacles, Math.max(2, Math.floor(expectedOuter * outerRatio)));

    const maxObstaclesNoBand = totalCells - minPassablePerLine * size;

    return {
        minPassablePerLine,
        maxObstacleRun,
        outerMin,
        outerMax,
        maxObstaclesNoBand,
    };
}

function maxObstacleRunInBoard(nextBoard) {
    let maxRun = 0;
    // rows
    for (let y = 0; y < n; y++) {
        let run = 0;
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] === 1) {
                run++;
                if (run > maxRun) maxRun = run;
            } else {
                run = 0;
            }
        }
    }
    // cols
    for (let x = 0; x < n; x++) {
        let run = 0;
        for (let y = 0; y < n; y++) {
            if (nextBoard[y][x] === 1) {
                run++;
                if (run > maxRun) maxRun = run;
            } else {
                run = 0;
            }
        }
    }
    return maxRun;
}

function countOuterObstacles(nextBoard) {
    let count = 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (!isOuterCell(y, x)) continue;
            if (nextBoard[y][x] === 1) count++;
        }
    }
    return count;
}

function hasMinPassablePerRowCol(nextBoard, minPassablePerLine) {
    for (let y = 0; y < n; y++) {
        let passable = 0;
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] === 0) passable++;
        }
        if (passable < minPassablePerLine) return false;
    }
    for (let x = 0; x < n; x++) {
        let passable = 0;
        for (let y = 0; y < n; y++) {
            if (nextBoard[y][x] === 0) passable++;
        }
        if (passable < minPassablePerLine) return false;
    }
    return true;
}

function isBoardAcceptable(nextBoard, obstacles, relaxLevel = 0) {
    const c = getNoBandConstraints(n, obstacles, relaxLevel);

    if (obstacles > c.maxObstaclesNoBand) {
        // この障害数だと「各行に最低k通行可能」を満たせない
        return false;
    }

    if (!hasMinPassablePerRowCol(nextBoard, c.minPassablePerLine)) return false;
    if (maxObstacleRunInBoard(nextBoard) > c.maxObstacleRun) return false;

    const outerObs = countOuterObstacles(nextBoard);
    if (outerObs < c.outerMin || outerObs > c.outerMax) return false;

    return true;
}

function countPassableCells() {
    let count = 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y][x] === 0) count++;
        }
    }
    return count;
}

/**
 * 【改善点1】パリティチェック（二部グラフの性質）
 * 
 * グリッドは市松模様（チェッカーボード）のように白黒に塗れる二部グラフです。
 * ハミルトンパス（すべての頂点を1回ずつ通る経路）が存在するためには、
 * 白マスと黒マスの数の差が1以下である必要があります。
 * 
 * 理由: パスは白→黒→白→黒...と交互に進むため、
 * 差が2以上あると、片方の色のマスを全て通ることが不可能になります。
 * 
 * @param nextBoard 盤面データ
 * @returns {boolean} パリティ条件を満たす場合true
 */
function checkParityCondition(nextBoard) {
    let whiteCount = 0; // (y+x)が偶数のマス
    let blackCount = 0; // (y+x)が奇数のマス
    
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] === 0) { // 通行可能マスのみカウント
                if ((y + x) % 2 === 0) {
                    whiteCount++;
                } else {
                    blackCount++;
                }
            }
        }
    }
    
    // 差が1以下ならハミルトンパスが存在する可能性がある
    return Math.abs(whiteCount - blackCount) <= 1;
}

function isValidSolutionPath(candidatePath) {
    if (!Array.isArray(candidatePath) || candidatePath.length < 2) return false;

    const totalPassableCells = countPassableCells();
    if (totalPassableCells < 2) return false;
    if (candidatePath.length !== totalPassableCells) return false;

    const seen = new Set();
    for (let i = 0; i < candidatePath.length; i++) {
        const cell = candidatePath[i];
        if (!cell || cell.length !== 2) return false;
        const [y, x] = cell;
        if (y < 0 || y >= n || x < 0 || x >= n) return false;
        if (board[y][x] === 1) return false;

        const key = `${y},${x}`;
        if (seen.has(key)) return false;
        seen.add(key);

        if (i > 0 && !isNeighbor(candidatePath[i - 1], cell)) return false;
    }

    const [sy, sx] = candidatePath[0];
    const [gy, gx] = candidatePath[candidatePath.length - 1];
    if (!isOuterCell(sy, sx) || !isOuterCell(gy, gx)) return false;
    if (sy === gy && sx === gx) return false;

    return true;
}

function getAvailableMoves(y, x, visited) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const moves = [];
    for (const [dy, dx] of directions) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
        if (board[ny][nx] === 1) continue;
        if (visited[ny][nx]) continue;
        moves.push([ny, nx]);
    }
    return moves;
}

function onwardDegree(y, x, visited) {
    return getAvailableMoves(y, x, visited).length;
}

function orderMovesHeuristic(moves, visited) {
    // Warnsdorff風: 次の手の候補が少ないマスを優先
    const scored = moves.map(([y, x]) => ({ y, x, d: onwardDegree(y, x, visited), r: Math.random() }));
    scored.sort((a, b) => (a.d - b.d) || (a.r - b.r));
    return scored.map(({ y, x }) => [y, x]);
}

function pickOuterToOuterSegment(basePath, segmentLength) {
    if (!Array.isArray(basePath)) return null;
    if (segmentLength < 2) return null;
    if (segmentLength > basePath.length) return null;

    const candidates = [];
    for (let i = 0; i + segmentLength - 1 < basePath.length; i++) {
        const [sy, sx] = basePath[i];
        const [gy, gx] = basePath[i + segmentLength - 1];
        if (!isOuterCell(sy, sx)) continue;
        if (!isOuterCell(gy, gx)) continue;
        if (sy === gy && sx === gx) continue;
        candidates.push(i);
    }

    if (candidates.length === 0) return null;
    const startIndex = candidates[Math.floor(Math.random() * candidates.length)];
    return basePath.slice(startIndex, startIndex + segmentLength);
}

function generateGreedyWalk(startCell, desiredLength) {
    if (!startCell) return null;
    if (desiredLength < 2 || desiredLength > n * n) return null;

    const visited = Array(n).fill(0).map(() => Array(n).fill(false));
    const candidatePath = [startCell];
    visited[startCell[0]][startCell[1]] = true;

    while (candidatePath.length < desiredLength) {
        const [y, x] = candidatePath[candidatePath.length - 1];
        const moves = getAvailableMoves(y, x, visited);
        if (moves.length === 0) return null;
        const ordered = orderMovesHeuristic(moves, visited);
        const topK = Math.min(3, ordered.length);
        const pick = ordered[Math.floor(Math.random() * topK)];
        const [ny, nx] = pick;
        visited[ny][nx] = true;
        candidatePath.push([ny, nx]);
    }

    const [gy, gx] = candidatePath[candidatePath.length - 1];
    if (!isOuterCell(gy, gx)) return null;
    if (gy === startCell[0] && gx === startCell[1]) return null;
    return candidatePath;
}

function computeTurnCount(candidatePath) {
    if (!candidatePath || candidatePath.length < 3) return 0;
    let turns = 0;
    for (let i = 2; i < candidatePath.length; i++) {
        const [y0, x0] = candidatePath[i - 2];
        const [y1, x1] = candidatePath[i - 1];
        const [y2, x2] = candidatePath[i];
        const dy1 = y1 - y0;
        const dx1 = x1 - x0;
        const dy2 = y2 - y1;
        const dx2 = x2 - x1;
        if (dy1 !== dy2 || dx1 !== dx2) turns++;
    }
    return turns;
}

function countObstacleComponents(nextBoard) {
    const visited = Array(n).fill(0).map(() => Array(n).fill(false));
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let components = 0;

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] !== 1 || visited[y][x]) continue;
            components++;
            const q = [[y, x]];
            visited[y][x] = true;
            while (q.length) {
                const [cy, cx] = q.pop();
                for (const [dy, dx] of dirs) {
                    const ny = cy + dy;
                    const nx = cx + dx;
                    if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
                    if (visited[ny][nx]) continue;
                    if (nextBoard[ny][nx] !== 1) continue;
                    visited[ny][nx] = true;
                    q.push([ny, nx]);
                }
            }
        }
    }
    return components;
}

function computeBranchEdges(candidatePath) {
    // 通行可能マス同士の隣接で「経路の連続ではない隣接」を数える（分岐・迷いポイントの指標）
    const indexMap = new Map();
    for (let i = 0; i < candidatePath.length; i++) {
        const [y, x] = candidatePath[i];
        indexMap.set(`${y},${x}`, i);
    }

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let extraAdj = 0;
    for (let i = 0; i < candidatePath.length; i++) {
        const [y, x] = candidatePath[i];
        for (const [dy, dx] of dirs) {
            const ny = y + dy;
            const nx = x + dx;
            const j = indexMap.get(`${ny},${nx}`);
            if (j === undefined) continue;
            if (Math.abs(i - j) === 1) continue;
            extraAdj++;
        }
    }
    return Math.floor(extraAdj / 2);
}

function computeObstacleBalancePenalty(nextBoard) {
    // 4象限と外周/内側の偏りをペナルティ化（小さいほど散らばりやすい）
    const mid = Math.floor(n / 2);
    const q = [0, 0, 0, 0];
    let outer = 0;
    let total = 0;

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] !== 1) continue;
            total++;
            const qi = (y < mid ? 0 : 2) + (x < mid ? 0 : 1);
            q[qi]++;
            if (isOuterCell(y, x)) outer++;
        }
    }
    if (total === 0) return 0;

    const idealQ = total / 4;
    const balancePenalty = q.reduce((sum, v) => sum + Math.abs(v - idealQ), 0);

    const outerCells = n === 1 ? 1 : (n * 4 - 4);
    const idealOuter = total * (outerCells / (n * n));
    const outerPenalty = Math.abs(outer - idealOuter);

    return balancePenalty + outerPenalty;
}

function computeRowColRunPenalty(nextBoard) {
    // 行/列の障害集中（長い連続）をペナルティ化
    let penalty = 0;
    for (let y = 0; y < n; y++) {
        let run = 0;
        let count = 0;
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] === 1) {
                count++;
                run++;
                if (run >= Math.max(4, Math.floor(n / 2))) penalty += 1;
            } else {
                run = 0;
            }
        }
        // 1行に偏りすぎるのもペナルティ
        if (count >= Math.floor(n * 0.75)) penalty += 3;
    }
    for (let x = 0; x < n; x++) {
        let run = 0;
        let count = 0;
        for (let y = 0; y < n; y++) {
            if (nextBoard[y][x] === 1) {
                count++;
                run++;
                if (run >= Math.max(4, Math.floor(n / 2))) penalty += 1;
            } else {
                run = 0;
            }
        }
        if (count >= Math.floor(n * 0.75)) penalty += 3;
    }
    return penalty;
}

function computeObstacleCentralityBonus(nextBoard, obstacles) {
    // 障害が中央寄り（リングが深い）ほどボーナス。
    // ※外周比率などのハード制約は isBoardAcceptable() 側で維持する。
    if (!obstacles || obstacles <= 0) return 0;
    const mean = obstacleRingMean(nextBoard, n);
    const expected = expectedRingMeanForUniformCells(n);
    // 期待値より中央寄りならプラス、外周寄りならマイナス（係数を大きくして強調）
    return (mean - expected) * obstacles * 2.5;
}

async function generateRandomPathPuzzle(targetObstacles, timeBudgetMs, relaxLevel = 0) {
    // 盤面は一旦「全部☒」にし、経路のマスだけ通行可能にする
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;
    if (passableLen < 2) return null;

    // NOTE: isBoardAcceptable は「配置済みの盤面」に対する検査。
    // ここで全マス☒の盤面を渡すと常にNGになるため、障害数の成立性は数値で判定する。
    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;
    if (c.outerMin > c.outerMax) return null;

    // 重要: この関数内で global の board を汚染しない
    const savedBoard = board;
    const emptyBoard = Array(n).fill(0).map(() => Array(n).fill(0));
    board = emptyBoard;

    const base = generateSnakePath();
    const outerStarts = base.filter(([y, x]) => isOuterCell(y, x));
    shuffleArray(outerStarts);

    const startTime = Date.now();
    const timeLimitMs = Math.max(200, timeBudgetMs ?? 2000);
    const maxRestarts = 5000; // フリーズ防止: 15000→5000に削減

    let best = null;
    let bestScore = -Infinity;

    try {
        for (let attempt = 0; attempt < maxRestarts; attempt++) {
            if (Date.now() - startTime > timeLimitMs) break;
            // ★フリーズ防止: より頻繁にUIスレッドに制御を戻す
            if (attempt % 20 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            const startCell = outerStarts[Math.floor(Math.random() * outerStarts.length)];
            const candidate = generateGreedyWalk(startCell, passableLen);
            if (!candidate) continue;

            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(1));
            for (const [y, x] of candidate) nextBoard[y][x] = 0;

            // ハード制約: 帯状や外周偏りを禁止（緩和レベル適用）
            if (!isBoardAcceptable(nextBoard, targetObstacles, relaxLevel)) continue;

            // candidate 検証時だけ board を差し替え
            board = nextBoard;
            const ok = isValidSolutionPath(candidate);
            board = emptyBoard;
            if (!ok) continue;

            const branchEdges = computeBranchEdges(candidate);
            const turns = computeTurnCount(candidate);
            const components = countObstacleComponents(nextBoard);
            const balancePenalty = computeObstacleBalancePenalty(nextBoard);
            const runPenalty = computeRowColRunPenalty(nextBoard);
            const centralityBonus = computeObstacleCentralityBonus(nextBoard, targetObstacles);
            const outerObstacles = countOuterObstacles(nextBoard);
            const outerPenalty = outerObstacles * 3;  // 外周のお邪魔マスを強くペナルティ
            const score = branchEdges * 4
                + turns * 0.18
                + components * 0.8
                + centralityBonus * 2.5
                - balancePenalty * 0.9
                - runPenalty * 2.2
                - outerPenalty;

            if (score > bestScore) {
                bestScore = score;
                best = { board: nextBoard, path: candidate };
            }
        }
    } finally {
        board = savedBoard;
    }

    if (best) return best;

    // フォールバック（蛇行セグメント）は帯が出やすいので、このモードでは使わない
    return null;
}

// 障害物を先に配置してから経路を探索する戦略（改善版: 分散配置アルゴリズム）
async function generateObstacleFirstPuzzle(targetObstacles, timeBudgetMs, relaxLevel = 0) {
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;
    if (passableLen < 2) return null;

    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;

    const savedBoard = board;
    const startTime = Date.now();
    const timeLimitMs = Math.max(200, timeBudgetMs ?? 2000);
    const maxAttempts = 3000; // フリーズ防止: 8000→3000に削減

    let best = null;
    let bestScore = -Infinity;

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (Date.now() - startTime > timeLimitMs) break;
            // ★フリーズ防止: より頻繁にUIスレッドに制御を戻す
            if (attempt % 15 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            // 改善: 複数の配置戦略をランダムに選択
            const strategy = attempt % 3;
            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(0));

            if (strategy === 0) {
                // 戦略A: 中央リング優先（従来）
                placeObstaclesCentralRing(nextBoard, targetObstacles);
            } else if (strategy === 1) {
                // 戦略B: 市松模様ベースの分散配置
                placeObstaclesCheckerboard(nextBoard, targetObstacles);
            } else {
                // 戦略C: 完全ランダム（外周保護のみ）
                placeObstaclesRandom(nextBoard, targetObstacles);
            }

            // 2. 盤面が制約を満たすかチェック
            if (!isBoardAcceptable(nextBoard, targetObstacles, relaxLevel)) continue;

            // 【改善点1】パリティチェック
            // 障害物配置直後に、白マスと黒マスの数の差をチェック
            // 差が2以上の場合、数学的にハミルトンパスは存在しないため、
            // 経路探索を行わずに即座に次の試行へ移る
            if (!checkParityCondition(nextBoard)) {
                continue; // 経路探索をスキップして次の試行へ
            }

            // 3. 通行可能マスが連結しているかチェック
            board = nextBoard;
            if (!isConnected()) {
                board = savedBoard;
                continue;
            }

            // 4. この盤面で経路を探索（generateSolutionPathを使用）
            const candidate = generateSolutionPath();
            board = savedBoard;

            if (!candidate) continue;

            // 5. スコアリング
            const branchEdges = computeBranchEdges(candidate);
            const turns = computeTurnCount(candidate);
            const components = countObstacleComponents(nextBoard);
            const balancePenalty = computeObstacleBalancePenalty(nextBoard);
            const runPenalty = computeRowColRunPenalty(nextBoard);
            const centralityBonus = computeObstacleCentralityBonus(nextBoard, targetObstacles);
            const outerObstacles = countOuterObstacles(nextBoard);
            const outerPenalty = outerObstacles * 2;

            const score = branchEdges * 4
                + turns * 0.18
                + components * 0.8
                + centralityBonus * 3.0  // 中央配置をより重視
                - balancePenalty * 0.9
                - runPenalty * 2.2
                - outerPenalty;

            if (score > bestScore) {
                bestScore = score;
                best = { board: nextBoard, path: candidate };
            }
        }
    } finally {
        board = savedBoard;
    }

    return best;
}

// 障害物配置戦略A: 中央リング優先
function placeObstaclesCentralRing(nextBoard, targetObstacles) {
    const obstacleCandidates = [];

    // 中央寄りのセルを優先的にリストアップ（リング順）
    for (let ring = Math.floor((n - 1) / 2); ring >= 0; ring--) {
        for (let y = ring; y < n - ring; y++) {
            for (let x = ring; x < n - ring; x++) {
                if (cellRing(y, x, n) === ring) {
                    obstacleCandidates.push([y, x]);
                }
            }
        }
    }
    shuffleArray(obstacleCandidates);

    // 外周の一部を保護（S/G用）
    const outerCells = obstacleCandidates.filter(([y, x]) => isOuterCell(y, x));
    const protectedOuter = new Set();
    const minProtected = Math.max(4, Math.floor(n * 0.8));
    for (let i = 0; i < Math.min(minProtected, outerCells.length); i++) {
        protectedOuter.add(`${outerCells[i][0]},${outerCells[i][1]}`);
    }

    // 障害物を配置
    let placed = 0;
    for (const [y, x] of obstacleCandidates) {
        if (placed >= targetObstacles) break;
        if (protectedOuter.has(`${y},${x}`)) continue;
        nextBoard[y][x] = 1;
        placed++;
    }
}

// 障害物配置戦略B: 市松模様ベースの分散配置
function placeObstaclesCheckerboard(nextBoard, targetObstacles) {
    const candidates = [];

    // 市松模様の黒マス（中央寄り優先）
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if ((y + x) % 2 === 0) {
                const ring = cellRing(y, x, n);
                candidates.push({ y, x, ring });
            }
        }
    }

    // リング値で降順ソート（中央が優先）+ ランダム性を追加
    candidates.sort((a, b) => {
        const ringDiff = b.ring - a.ring;
        if (ringDiff !== 0) return ringDiff;
        return Math.random() - 0.5;
    });

    // 外周を保護
    const protectedOuter = new Set();
    const outerCells = candidates.filter(c => isOuterCell(c.y, c.x));
    const minProtected = Math.max(4, Math.floor(n * 0.6));
    for (let i = 0; i < Math.min(minProtected, outerCells.length); i++) {
        protectedOuter.add(`${outerCells[i].y},${outerCells[i].x}`);
    }

    let placed = 0;
    for (const { y, x } of candidates) {
        if (placed >= targetObstacles) break;
        if (protectedOuter.has(`${y},${x}`)) continue;
        nextBoard[y][x] = 1;
        placed++;
    }

    // 足りない場合は白マスからも追加
    if (placed < targetObstacles) {
        const whiteCandidates = [];
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if ((y + x) % 2 === 1 && nextBoard[y][x] === 0) {
                    whiteCandidates.push([y, x]);
                }
            }
        }
        shuffleArray(whiteCandidates);
        for (const [y, x] of whiteCandidates) {
            if (placed >= targetObstacles) break;
            if (isOuterCell(y, x) && protectedOuter.size < minProtected) continue;
            nextBoard[y][x] = 1;
            placed++;
        }
    }
}

// 障害物配置戦略C: 完全ランダム（外周保護のみ）
function placeObstaclesRandom(nextBoard, targetObstacles) {
    const allCells = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            allCells.push([y, x]);
        }
    }
    shuffleArray(allCells);

    // 外周を多めに保護
    const outerCells = allCells.filter(([y, x]) => isOuterCell(y, x));
    const protectedOuter = new Set();
    const minProtected = Math.max(6, Math.floor(n * 1.2));
    shuffleArray(outerCells);
    for (let i = 0; i < Math.min(minProtected, outerCells.length); i++) {
        protectedOuter.add(`${outerCells[i][0]},${outerCells[i][1]}`);
    }

    let placed = 0;
    for (const [y, x] of allCells) {
        if (placed >= targetObstacles) break;
        if (protectedOuter.has(`${y},${x}`)) continue;
        nextBoard[y][x] = 1;
        placed++;
    }
}

// キャンバスサイズを更新（スマホ対応）
function updateCanvasSize() {
    // 画面幅に応じて最大サイズを調整
    const viewportWidth = window.innerWidth;
    const maxSize = viewportWidth < 600
        ? Math.min(viewportWidth - 40, 400)  // スマホ: 画面幅に収める
        : 560;                                // PC: 従来通り
    cellSize = Math.floor(maxSize / n);
    boardPadding = viewportWidth < 600 ? 12 : 20;
    const canvasSize = cellSize * n + boardPadding * 2;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
}

// お邪魔マス数の上限を更新
function updateObstacleMax() {
    const totalCells = n * n;
    // 最低でも通行可能マスを2つ残す（スタート・ゴール）
    const maxObstacles = Math.max(0, totalCells - 2);
    const minObstacles = Math.min(maxObstacles, getMinObstaclesForSize(n));
    obstacleInput.min = minObstacles;
    obstacleInput.max = maxObstacles;
    obstacleMaxEl.textContent = `(最小: ${minObstacles} / 最大: ${maxObstacles})`;

    const current = parseInt(obstacleInput.value);
    if (!Number.isNaN(current) && current > maxObstacles) {
        obstacleInput.value = maxObstacles;
        obstacleCount = maxObstacles;
    }
    if (!Number.isNaN(current) && current < minObstacles) {
        obstacleInput.value = minObstacles;
        obstacleCount = minObstacles;
    }
}

// 問題を生成（大幅強化版: 時間予算増加 + 試行回数増加 + 分散配置）
async function generatePuzzle() {
    updateCanvasSize();
    updateObstacleMax();

    const totalCells = n * n;
    const maxObstacles = parseInt(obstacleInput.max);
    const minObstacles = parseInt(obstacleInput.min);
    let targetObstacles = obstacleCount;
    if (!Number.isNaN(maxObstacles)) targetObstacles = Math.min(targetObstacles, maxObstacles);
    if (!Number.isNaN(minObstacles)) targetObstacles = Math.max(targetObstacles, minObstacles);
    targetObstacles = Math.max(0, Math.min(targetObstacles, totalCells - 2));

    // 「上下帯回避」制約で成立できない障害数は自動調整
    const maxNoBand = getNoBandConstraints(n, targetObstacles, 0).maxObstaclesNoBand;
    if (targetObstacles > maxNoBand) {
        targetObstacles = maxNoBand;
    }

    const originalTarget = targetObstacles;
    let result = null;

    // ★フリーズ防止: 全体の時間制限を設定（最大8秒）
    const globalStartTime = Date.now();
    const globalTimeLimit = 8000; // 8秒
    const isTimeUp = () => Date.now() - globalStartTime > globalTimeLimit;

    // 改善1: 時間予算（サイズに応じて調整）
    const baseBudget = 1000 + (n - 6) * 500; // 6x6:1秒, 10x10:3秒
    const budgets = [
        Math.min(2000, baseBudget),
        Math.min(4000, baseBudget * 1.5),
    ];

    // 戦略1: 両方の生成方式を段階的に試行
    for (const budget of budgets) {
        if (isTimeUp()) break; // ★時間制限チェック
        // ★フリーズ防止: 戦略切り替え時にyield
        await new Promise(resolve => setTimeout(resolve, 0));
        // 経路優先方式（relaxLevel=0）
        result = await generateRandomPathPuzzle(targetObstacles, budget, 0);
        if (result) break;
        if (isTimeUp()) break; // ★時間制限チェック
        // 障害物先置き方式（relaxLevel=0）
        result = await generateObstacleFirstPuzzle(targetObstacles, budget, 0);
        if (result) break;
    }

    // 戦略2: 制約を段階的に緩和（早期適用）
    if (!result && !isTimeUp()) {
        for (let relaxLevel = 1; relaxLevel <= 2; relaxLevel++) {
            if (isTimeUp()) break; // ★時間制限チェック
            // ★フリーズ防止: 戦略切り替え時にyield
            await new Promise(resolve => setTimeout(resolve, 0));
            const relaxBudget = Math.min(2000, baseBudget);
            result = await generateRandomPathPuzzle(targetObstacles, relaxBudget, relaxLevel);
            if (result) break;
            if (isTimeUp()) break; // ★時間制限チェック
            result = await generateObstacleFirstPuzzle(targetObstacles, relaxBudget, relaxLevel);
            if (result) break;
        }
    }

    // 戦略3: 障害物数を動的に減らして再試行（最低保証は維持）
    // ★フリーズ防止: whileループに時間制限を追加
    if (!result && !isTimeUp()) {
        const minGuarantee = Math.max(minObstacles, Math.floor(totalCells * 0.08)); // 最低8%
        let reducedObstacles = targetObstacles;

        while (!result && reducedObstacles > minGuarantee && !isTimeUp()) {
            // ★フリーズ防止: 各ループでyield
            await new Promise(resolve => setTimeout(resolve, 0));
            reducedObstacles = Math.max(minGuarantee, reducedObstacles - 2); // 2ずつ減らす（高速化）
            const reduceBudget = Math.min(1500, baseBudget * 0.5); // ★予算を削減して高速化

            // 緩和レベル0のみ試行
            result = await generateRandomPathPuzzle(reducedObstacles, reduceBudget, 0);
            if (!result && !isTimeUp()) {
                result = await generateObstacleFirstPuzzle(reducedObstacles, reduceBudget, 0);
            }
        }

        if (result) {
            targetObstacles = reducedObstacles;
        }
    }

    // 結果を適用
    if (result) {
        board = result.board;
        solutionPath = result.path;
        startPos = solutionPath[0];
        goalPos = solutionPath[solutionPath.length - 1];
        obstacleCount = targetObstacles;
        obstacleInput.value = targetObstacles;
        generationFailed = false;

        // 障害物数が調整された場合のみメッセージ表示
        if (targetObstacles < originalTarget) {
            messageEl.textContent = `生成のため、お邪魔マス数を ${targetObstacles} に調整しました`;
        } else {
            messageEl.textContent = '';
        }
    } else {
        // 生成失敗
        generationFailed = true;
        board = Array(n).fill(0).map(() => Array(n).fill(0));
        solutionPath = null;
        startPos = null;
        goalPos = null;
    }

    path = [];
    isDrawing = false;
    gameCleared = false;
    if (!messageEl.textContent) messageEl.textContent = '';
}

// お邪魔マスを安全に配置（連結性とスタート・ゴール候補を保証）
function placeObstaclesSafely(count) {
    // 外周以外のマスのリスト
    const innerCells = [];
    for (let y = 1; y < n - 1; y++) {
        for (let x = 1; x < n - 1; x++) {
            innerCells.push([y, x]);
        }
    }

    // 内部マスが少ない場合
    if (innerCells.length < count) {
        // 全マスから外周の一部を除いたリスト
        const allCells = [];
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                allCells.push([y, x]);
            }
        }

        // 外周マスをリストアップ
        const outerCells = [];
        for (let x = 0; x < n; x++) {
            outerCells.push([0, x]);
            outerCells.push([n - 1, x]);
        }
        for (let y = 1; y < n - 1; y++) {
            outerCells.push([y, 0]);
            outerCells.push([y, n - 1]);
        }

        // 外周から最低4つは残す
        shuffleArray(outerCells);
        const protectedOuter = new Set(outerCells.slice(0, 4).map(([y, x]) => `${y},${x}`));

        // 保護された外周以外からランダムに選択
        const candidates = allCells.filter(([y, x]) => !protectedOuter.has(`${y},${x}`));
        shuffleArray(candidates);

        for (let i = 0; i < Math.min(count, candidates.length); i++) {
            const [y, x] = candidates[i];
            board[y][x] = 1;
        }
    } else {
        // 内部マスから選択
        shuffleArray(innerCells);
        for (let i = 0; i < count; i++) {
            const [y, x] = innerCells[i];
            board[y][x] = 1;
        }
    }

    // 通行可能マスが連結しているか確認
    if (!isConnected()) return false;

    // 外周に通行可能マスが2つ以上あるか確認
    let outerPassableCount = 0;
    for (let x = 0; x < n; x++) {
        if (board[0][x] === 0) outerPassableCount++;
        if (board[n - 1][x] === 0) outerPassableCount++;
    }
    for (let y = 1; y < n - 1; y++) {
        if (board[y][0] === 0) outerPassableCount++;
        if (board[y][n - 1] === 0) outerPassableCount++;
    }

    return outerPassableCount >= 2;
}

// 通行可能マスが連結しているか確認（BFS）
function isConnected() {
    // 最初の通行可能マスを探す
    let startCell = null;
    for (let y = 0; y < n && !startCell; y++) {
        for (let x = 0; x < n && !startCell; x++) {
            if (board[y][x] === 0) {
                startCell = [y, x];
            }
        }
    }

    if (!startCell) return false;

    // BFSで到達可能なマスをカウント
    const visited = Array(n).fill(0).map(() => Array(n).fill(false));
    const queue = [startCell];
    visited[startCell[0]][startCell[1]] = true;
    let visitedCount = 1;

    while (queue.length > 0) {
        const [y, x] = queue.shift();
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [dy, dx] of directions) {
            const ny = y + dy;
            const nx = x + dx;

            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 1) continue;
            if (visited[ny][nx]) continue;

            visited[ny][nx] = true;
            queue.push([ny, nx]);
            visitedCount++;
        }
    }

    // 通行可能マスの総数をカウント
    let totalPassable = 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y][x] === 0) totalPassable++;
        }
    }

    return visitedCount === totalPassable;
}

/**
 * 【改善点2】枝刈り付きバックトラッキングによる経路探索
 * 
 * 旧: ランダムDFSで運任せだった
 * 新: 以下の枝刈りを実装して探索効率を大幅に向上
 * 
 * 枝刈り条件:
 * 1. 連結性チェック: 未訪問マスが分断されていないか確認
 * 2. ゴール到達可能性: 外周の未訪問マスがあるか確認（ゴール候補が残っているか）
 * 3. 行き止まり検出: 次の手がない場合に即座に引き返す
 * 
 * @param maxIterations 最大イテレーション数（フリーズ防止用）
 * @returns 解答経路、または null
 */
function generateSolutionPath(maxIterations = 50000) {
    // 外周の通行可能マスを収集（スタート候補）
    const outerCells = [];
    for (let x = 0; x < n; x++) {
        if (board[0][x] === 0) outerCells.push([0, x]);
        if (n > 1 && board[n - 1][x] === 0) outerCells.push([n - 1, x]);
    }
    for (let y = 1; y < n - 1; y++) {
        if (board[y][0] === 0) outerCells.push([y, 0]);
        if (n > 1 && board[y][n - 1] === 0) outerCells.push([y, n - 1]);
    }

    if (outerCells.length < 2) return null;

    const totalPassableCells = countPassableCells();
    if (totalPassableCells < 2) return null;

    const visited = Array(n).fill(0).map(() => Array(n).fill(false));
    let iterations = 0;
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    /**
     * 枝刈り用ヘルパー: 未訪問マスが連結しているかをBFSで確認
     * また、外周に未訪問マスがあるか（ゴール候補が残っているか）も同時にチェック
     */
    function checkConnectivityAndGoalReachability(currentY, currentX) {
        // 未訪問マスをカウントし、最初の未訪問マスを見つける
        let unvisitedCount = 0;
        let firstUnvisited = null;
        let hasOuterUnvisited = false;
        
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (board[y][x] === 0 && !visited[y][x]) {
                    unvisitedCount++;
                    if (!firstUnvisited) firstUnvisited = [y, x];
                    if (isOuterCell(y, x)) hasOuterUnvisited = true;
                }
            }
        }
        
        // 未訪問マスがない場合は連結とみなす
        if (unvisitedCount === 0) {
            return { connected: true, hasOuterUnvisited: false, unvisitedCount: 0 };
        }
        
        // BFSで未訪問マスの連結成分サイズを計算
        const tempVisited = Array(n).fill(0).map(() => Array(n).fill(false));
        const queue = [firstUnvisited];
        tempVisited[firstUnvisited[0]][firstUnvisited[1]] = true;
        let connectedCount = 1;
        
        while (queue.length > 0) {
            const [y, x] = queue.shift();
            for (const [dy, dx] of directions) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
                if (board[ny][nx] === 1) continue;
                if (visited[ny][nx]) continue; // 既に経路で訪問済み
                if (tempVisited[ny][nx]) continue; // 今回のBFSで訪問済み
                
                tempVisited[ny][nx] = true;
                connectedCount++;
                queue.push([ny, nx]);
            }
        }
        
        // 現在位置から未訪問マスに到達できるかもチェック
        let canReachUnvisited = false;
        for (const [dy, dx] of directions) {
            const ny = currentY + dy;
            const nx = currentX + dx;
            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 0 && !visited[ny][nx]) {
                canReachUnvisited = true;
                break;
            }
        }
        
        return {
            connected: connectedCount === unvisitedCount && canReachUnvisited,
            hasOuterUnvisited,
            unvisitedCount
        };
    }

    /**
     * 枝刈り付きバックトラッキング
     * Warnsdorffヒューリスティック（次の手が少ないマスを優先）も適用
     */
    function backtrack(y, x, path) {
        iterations++;
        if (iterations > maxIterations) return null;

        // 全マス訪問完了チェック
        if (path.length === totalPassableCells) {
            const [gy, gx] = path[path.length - 1];
            // ゴールは外周にある必要がある
            if (isOuterCell(gy, gx)) {
                return path;
            }
            return null;
        }

        // 移動可能なマスを取得
        const moves = [];
        for (const [dy, dx] of directions) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 1) continue;
            if (visited[ny][nx]) continue;
            moves.push([ny, nx]);
        }

        // 行き止まり検出（枝刈り1）
        if (moves.length === 0) {
            return null;
        }

        // 残り1マスの場合は連結性チェック不要（最終マスなので）
        const remaining = totalPassableCells - path.length;
        
        // 残りマスが多い場合のみ、重い連結性チェックを実行
        if (remaining > 1 && remaining <= 30) {
            const connectivity = checkConnectivityAndGoalReachability(y, x);
            
            // 枝刈り2: 未訪問マスが分断されている場合は打ち切り
            if (!connectivity.connected) {
                return null;
            }
            
            // 枝刈り3: 外周に未訪問マスがない場合、ゴールに到達できないので打ち切り
            // ただし、残り1マスで現在位置が外周の場合は例外
            if (!connectivity.hasOuterUnvisited && !(remaining === 1 && isOuterCell(y, x))) {
                return null;
            }
        }

        // Warnsdorffヒューリスティック: 次の手が少ないマスを優先
        const scoredMoves = moves.map(([ny, nx]) => {
            let degree = 0;
            for (const [dy, dx] of directions) {
                const nny = ny + dy;
                const nnx = nx + dx;
                if (nny < 0 || nny >= n || nnx < 0 || nnx >= n) continue;
                if (board[nny][nnx] === 1) continue;
                if (visited[nny][nnx]) continue;
                if (nny === ny && nnx === nx) continue;
                degree++;
            }
            // 外周マスを少し優先（ゴール候補として残す価値がある）
            const outerBonus = isOuterCell(ny, nx) ? -0.5 : 0;
            return { y: ny, x: nx, score: degree + outerBonus + Math.random() * 0.1 };
        });
        
        // スコアが低い順（次の手が少ない順）にソート
        scoredMoves.sort((a, b) => a.score - b.score);

        // 各移動先を試行
        for (const { y: ny, x: nx } of scoredMoves) {
            visited[ny][nx] = true;
            const result = backtrack(ny, nx, [...path, [ny, nx]]);
            if (result) return result;
            visited[ny][nx] = false;
        }

        return null;
    }

    // 複数のスタート地点を試行（成功率を上げるため）
    shuffleArray(outerCells);
    const maxStartAttempts = Math.min(outerCells.length, 5);
    
    for (let i = 0; i < maxStartAttempts; i++) {
        const startCell = outerCells[i];
        
        // visited配列をリセット
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                visited[y][x] = false;
            }
        }
        iterations = 0;
        
        visited[startCell[0]][startCell[1]] = true;
        const result = backtrack(startCell[0], startCell[1], [startCell]);
        if (result) return result;
    }
    
    return null;
}

// 配列をシャッフル
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// フォールバック用：確実に解ける蛇行パターン
function generateSnakePath() {
    const result = [];

    // 左上からスタート
    let dir = 1; // 1: 右、-1: 左

    for (let y = 0; y < n; y++) {
        if (dir === 1) {
            // 左から右へ
            for (let x = 0; x < n; x++) {
                result.push([y, x]);
            }
        } else {
            // 右から左へ
            for (let x = n - 1; x >= 0; x--) {
                result.push([y, x]);
            }
        }
        dir *= -1;
    }

    return result;
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ダークテーマ判定
    const dark = isDarkTheme;

    // マス描画
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const px = boardPadding + x * cellSize;
            const py = boardPadding + y * cellSize;
            // ☒マス（障害物）
            if (board[y][x] === 1) {
                // ダークテーマ: 濃い紫がかった灰色、ライトテーマ: 灰色
                ctx.fillStyle = dark ? '#2d2d44' : '#888';
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = dark ? '#1e1e33' : '#555';
                ctx.strokeRect(px, py, cellSize, cellSize);
                // ×印の色 - ダークテーマでは明るく、ライトテーマでは白
                ctx.strokeStyle = dark ? '#8888aa' : '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px + 10, py + 10);
                ctx.lineTo(px + cellSize - 10, py + cellSize - 10);
                ctx.moveTo(px + cellSize - 10, py + 10);
                ctx.lineTo(px + 10, py + cellSize - 10);
                ctx.stroke();
                ctx.lineWidth = 1;
            } else {
                // 通常マス: ダークテーマでは暗め、ライトテーマでは白
                ctx.fillStyle = dark ? '#3a4a5a' : '#fff';
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = dark ? '#4a5a6a' : '#bbb';
                ctx.strokeRect(px, py, cellSize, cellSize);
            }
        }
    }
    // 経路描画
    if (path.length > 0) {
        // ダークテーマでは明るい水色、ライトテーマでは青
        ctx.strokeStyle = dark ? '#5cc9f5' : '#1976d2';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            const [y, x] = path[i];
            const cx = boardPadding + x * cellSize + cellSize / 2;
            const cy = boardPadding + y * cellSize + cellSize / 2;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    // クリック中のマスを丸印で表示（S/Gに被る場合は非表示）
    if (isDrawing && activePointerCell) {
        const [ay, ax] = activePointerCell;
        const onStart = startPos && ay === startPos[0] && ax === startPos[1];
        const onGoal = goalPos && ay === goalPos[0] && ax === goalPos[1];
        if (!onStart && !onGoal) {
            // ダークテーマでは明るい青
            drawMarker(ax, ay, dark ? '#5cc9f5' : '#1976d2', null);
        }
    }

    // スタート・ゴール表示
    if (startPos && goalPos) {
        const [sy, sx] = startPos;
        const [gy, gx] = goalPos;
        // ダークテーマでは明るい緑と赤
        drawMarker(sx, sy, dark ? '#66bb6a' : '#43a047', 'S'); // スタート:緑
        drawMarker(gx, gy, dark ? '#ef5350' : '#d32f2f', 'G'); // ゴール:赤
    }

    // クリア時のメッセージオーバーレイ（キャンバス上に描画）
    if (gameCleared) {
        drawClearOverlay();
    }

    // 生成失敗時のオーバーレイ
    if (generationFailed) {
        drawFailedOverlay();
    }
}

function drawClearOverlay() {
    // 半透明の背景でルートが透けて見える
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // クリアメッセージ
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(24, Math.floor(cellSize * 0.8))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText('🎉 クリア！ 🎉', canvas.width / 2, canvas.height / 2);
    ctx.restore();
}

// 生成失敗時のオーバーレイ
function drawFailedOverlay() {
    // 赤みがかった半透明の背景
    ctx.fillStyle = 'rgba(180, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 失敗メッセージ
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(20, Math.floor(cellSize * 0.6))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText('⚠️ 生成失敗', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = `${Math.max(14, Math.floor(cellSize * 0.35))}px sans-serif`;
    ctx.fillText('設定を変更してください', canvas.width / 2, canvas.height / 2 + 20);
    ctx.restore();
}

// 難易度を0.0〜5.0の範囲で計算（0.1刻み）
// 基準：お邪魔マス0は難易度0.0、10x10は5.0に近く、6x6は0.0に近い
function calculateDifficulty() {
    if (!solutionPath || solutionPath.length < 2) return 0.0;

    const totalCells = n * n;
    const passableCells = countPassableCells();
    const obstacles = totalCells - passableCells;

    // お邪魔マス0の場合は難易度0.0
    if (obstacles === 0) return 0.0;

    // === 各要素の計算 ===

    // 1. 盤面サイズ要素 (6=0.0, 10=1.0)
    const sizeFactor = (n - 6) / 4;

    // 2. 障害物密度要素
    // 空きマスあたりの障害物比率（障害物が多いほど難しい）
    const maxPossibleObstacles = totalCells - 2; // 最低2マスは通行可能
    const obstacleRatio = obstacles / maxPossibleObstacles;
    const obstacleFactor = Math.min(obstacleRatio * 2, 1); // 50%でカンスト

    // 3. 曲がり角要素（多いほど難しい）
    const turns = computeTurnCount(solutionPath);
    const avgTurnsPerCell = turns / passableCells;
    const turnFactor = Math.min(avgTurnsPerCell / 0.5, 1); // 0.5でカンスト

    // 4. 分岐要素（迷いやすさ）
    const branchEdges = computeBranchEdges(solutionPath);
    const branchRatio = branchEdges / passableCells;
    const branchFactor = Math.min(branchRatio / 0.3, 1); // 0.3でカンスト

    // 5. 障害物の分散度（コンポーネント数が多いほど迷いやすい）
    const components = countObstacleComponents(board);
    const componentRatio = obstacles > 0 ? components / obstacles : 0;
    const componentFactor = Math.min(componentRatio * 2, 1); // 0.5でカンスト

    // 6. 中央配置要素（中央に障害物があるほど難しい）
    const ringMean = obstacleRingMean(board, n);
    const maxRing = Math.floor((n - 1) / 2);
    const centralityFactor = maxRing > 0 ? ringMean / maxRing : 0;

    // 7. 行列に図る障害物の分布（行/列に空きが少ないほど難しい）
    let minPassableInLine = Infinity;
    for (let y = 0; y < n; y++) {
        let count = 0;
        for (let x = 0; x < n; x++) if (board[y][x] === 0) count++;
        minPassableInLine = Math.min(minPassableInLine, count);
    }
    for (let x = 0; x < n; x++) {
        let count = 0;
        for (let y = 0; y < n; y++) if (board[y][x] === 0) count++;
        minPassableInLine = Math.min(minPassableInLine, count);
    }
    // 行/列の最小通行可能数が少ないほど難しい
    const lineRestrictionFactor = Math.max(0, 1 - (minPassableInLine - 2) / (n - 2));

    // === 重み付け合計 ===
    // 盤面サイズと障害物密度を主要因子とし、他の要素で微調整
    const baseScore = (
        sizeFactor * 0.35 +           // 盤面サイズ: 35%
        obstacleFactor * 0.25 +       // 障害物密度: 25%
        turnFactor * 0.10 +           // 曲がり角: 10%
        branchFactor * 0.12 +         // 分岐: 12%
        componentFactor * 0.08 +      // 分散度: 8%
        centralityFactor * 0.05 +     // 中央配置: 5%
        lineRestrictionFactor * 0.05  // 行列制限: 5%
    );

    // 0.0〜5.0にマッピングし、0.1刻みに丸める
    const difficulty = baseScore * 5.0;
    return Math.round(difficulty * 10) / 10;
}

// 難易度表示を更新
function updateDifficultyDisplay() {
    // 生成失敗時はエラー表示
    if (generationFailed) {
        difficultyValueEl.textContent = 'エラー';
        difficultyValueEl.style.color = '#d32f2f';
        difficultyFillEl.style.width = '0%';
        difficultyFillEl.style.backgroundColor = '#d32f2f';
        return;
    }

    // 生成中は「---」表示
    if (isGenerating) {
        difficultyValueEl.textContent = '---';
        difficultyValueEl.style.color = '';
        return;
    }

    const difficulty = calculateDifficulty();
    difficultyValueEl.textContent = difficulty.toFixed(1);
    difficultyValueEl.style.color = ''; // デフォルトに戻す

    // バーの幅を更新（0.0〜5.0を0%〜100%に）
    const percent = (difficulty / 5.0) * 100;
    difficultyFillEl.style.width = `${percent}%`;

    // 難易度に応じて色を変更
    let color;
    if (difficulty < 1.0) {
        color = '#4caf50'; // 緑（簡単）
    } else if (difficulty < 2.0) {
        color = '#8bc34a'; // 黄緑
    } else if (difficulty < 3.0) {
        color = '#ffeb3b'; // 黄
    } else if (difficulty < 4.0) {
        color = '#ff9800'; // オレンジ
    } else {
        color = '#f44336'; // 赤（難しい）
    }
    difficultyFillEl.style.backgroundColor = color;
}

function drawMarker(x, y, color, label) {
    const cx = boardPadding + x * cellSize + cellSize / 2;
    const cy = boardPadding + y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize / 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 色だけだと判別しにくいので文字ラベルを重ねる
    if (label) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(14, Math.floor(cellSize * 0.28))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
        ctx.restore();
    }
}

function cellEq(a, b) {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

function findCellIndexInPath(cell) {
    for (let i = 0; i < path.length; i++) {
        if (cellEq(path[i], cell)) return i;
    }
    return -1;
}

function getCellFromPos(mx, my) {
    const x = Math.floor((mx - boardPadding) / cellSize);
    const y = Math.floor((my - boardPadding) / cellSize);
    if (x < 0 || x >= n || y < 0 || y >= n) return null;
    if (board[y][x] === 1) return null;
    return [y, x];
}

function isNeighbor(a, b) {
    if (!a || !b) return false;
    const [y1, x1] = a, [y2, x2] = b;
    return (Math.abs(y1 - y2) + Math.abs(x1 - x2)) === 1;
}

function isOuterCell(y, x) {
    return y === 0 || y === n - 1 || x === 0 || x === n - 1;
}

function onPointerDown(e) {
    if (gameCleared || isGenerating || generationFailed) return; // 生成失敗時も操作無効
    e.preventDefault(); // スマホでスクロール防止
    const rect = canvas.getBoundingClientRect();
    const mx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const my = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const cell = getCellFromPos(mx, my);
    if (!cell) return;

    activePointerCell = cell;

    // 仕様変更:
    // - 途中で離したらそこで止まり、最後のマスから続きが描ける
    // - 既に描いたルート上をクリックしたら、そこまで戻して続きが描ける
    if (!Array.isArray(path) || path.length === 0) {
        // 初回はスタートマスからのみ開始
        if (!startPos || cell[0] !== startPos[0] || cell[1] !== startPos[1]) return;
        path = [cell];
    } else {
        const last = path[path.length - 1];
        if (cellEq(cell, last)) {
            // 続き開始OK
        } else {
            const idx = findCellIndexInPath(cell);
            if (idx >= 0) {
                // クリックした地点まで巻き戻す
                path = path.slice(0, idx + 1);
            } else {
                // 既存の末端/ルート上以外からは再開しない（誤操作防止）
                return;
            }
        }
    }

    isDrawing = true;
    messageEl.textContent = '';
    messageEl.style.color = '';
    drawBoard();
}

function onPointerMove(e) {
    if (!isDrawing || gameCleared || isGenerating || generationFailed) return; // 生成失敗時も操作無効
    e.preventDefault(); // スマホでスクロール防止
    const rect = canvas.getBoundingClientRect();
    const mx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const my = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const cell = getCellFromPos(mx, my);
    if (!cell) return;

    activePointerCell = cell;
    const last = path[path.length - 1];
    if (!isNeighbor(last, cell)) return;

    // 「後ろに戻す」: 直前のマスに戻ったら一手取り消し
    if (path.length >= 2 && cellEq(cell, path[path.length - 2])) {
        path.pop();
        drawBoard();
        return;
    }

    // 既に通ったマスへの前進は不可
    if (findCellIndexInPath(cell) >= 0) return;

    path.push(cell);
    drawBoard();
}

function onPointerUp(e) {
    if (!isDrawing || gameCleared || isGenerating) return;
    isDrawing = false;
    activePointerCell = null;

    // 途中で離してOK。完成していればクリア。
    if (checkClear()) {
        gameCleared = true;
    } else {
        messageEl.textContent = '';
    }
    drawBoard();
}

function checkClear() {
    // 1. 全通行可能マスを1回ずつ通過
    let count = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (board[y][x] === 0) count++;
    if (path.length !== count) return false;
    // 2. スタートマスから開始、ゴールマスで終了
    const [sy, sx] = path[0];
    const [gy, gx] = path[path.length - 1];
    if (sy !== startPos[0] || sx !== startPos[1]) return false;
    if (gy !== goalPos[0] || gx !== goalPos[1]) return false;
    // 3. 途中で分岐・交差・戻りがない
    for (let i = 1; i < path.length; i++) {
        if (!isNeighbor(path[i - 1], path[i])) return false;
    }
    // 4. ☒マスを通っていない
    for (const [y, x] of path) if (board[y][x] === 1) return false;
    // 5. 端点は2つだけ
    // 既にpathで1回ずつしか通っていないのでOK
    return true;
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('mouseleave', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown);
canvas.addEventListener('touchmove', onPointerMove);
canvas.addEventListener('touchend', onPointerUp);

resetBtn.addEventListener('click', () => {
    path = [];
    isDrawing = false;
    gameCleared = false;
    messageEl.textContent = '';
    drawBoard();
});

// 次の問題ボタン
regenerateBtn.addEventListener('click', () => {
    // 次の問題でもお邪魔マス数をランダムに設定
    obstacleCount = getRandomInitialObstacles(n);
    obstacleInput.value = obstacleCount;
    void regenerateAndDraw();
});

// この設定で生成ボタン（入力したお邪魔マス数を維持）
generateWithSettingsBtn.addEventListener('click', () => {
    // 現在の入力値をそのまま使用
    obstacleCount = parseInt(obstacleInput.value) || 0;
    const maxObstacles = parseInt(obstacleInput.max);
    const minObstacles = parseInt(obstacleInput.min);
    if (!Number.isNaN(maxObstacles) && obstacleCount > maxObstacles) {
        obstacleCount = maxObstacles;
        obstacleInput.value = maxObstacles;
    }
    if (!Number.isNaN(minObstacles) && obstacleCount < minObstacles) {
        obstacleCount = minObstacles;
        obstacleInput.value = minObstacles;
    }
    void regenerateAndDraw();
});

// サイズ変更
sizeSelect.addEventListener('change', (e) => {
    n = parseInt(e.target.value);
    // サイズ変更時は1割～2割の範囲でランダムに初期化
    obstacleCount = getRandomInitialObstacles(n);
    obstacleInput.value = obstacleCount;
    void regenerateAndDraw();
});

// お邪魔マス数変更
obstacleInput.addEventListener('change', (e) => {
    obstacleCount = parseInt(e.target.value) || 0;
    const minObstacles = parseInt(obstacleInput.min);
    const maxObstacles = parseInt(obstacleInput.max);
    if (!Number.isNaN(maxObstacles) && obstacleCount > maxObstacles) {
        obstacleCount = maxObstacles;
        obstacleInput.value = maxObstacles;
    }
    if (!Number.isNaN(minObstacles) && obstacleCount < minObstacles) {
        obstacleCount = minObstacles;
        obstacleInput.value = minObstacles;
    }
    if (obstacleCount < 0) {
        obstacleCount = 0;
        obstacleInput.value = 0;
    }
});

// クリアルート表示ボタン（モーダルで表示）
hintBtn.addEventListener('click', () => {
    if (isGenerating || !solutionPath) return;
    showSolutionModal();
});

// モーダルでクリアルートを表示
function showSolutionModal() {
    const modal = document.getElementById('solution-modal');
    const solutionCanvas = document.getElementById('solution-canvas');
    const solutionInfo = document.getElementById('solution-info');
    const solutionCtx = solutionCanvas.getContext('2d');

    // キャンバスサイズ設定
    const modalCanvasSize = cellSize * n + boardPadding * 2;
    solutionCanvas.width = modalCanvasSize;
    solutionCanvas.height = modalCanvasSize;

    // モーダル表示
    modal.style.display = 'block';

    // 盤面描画
    solutionCtx.clearRect(0, 0, solutionCanvas.width, solutionCanvas.height);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            const px = boardPadding + x * cellSize;
            const py = boardPadding + y * cellSize;
            if (board[y][x] === 1) {
                solutionCtx.fillStyle = '#888';
                solutionCtx.fillRect(px, py, cellSize, cellSize);
                solutionCtx.strokeStyle = '#555';
                solutionCtx.strokeRect(px, py, cellSize, cellSize);
                solutionCtx.strokeStyle = '#fff';
                solutionCtx.beginPath();
                solutionCtx.moveTo(px + 10, py + 10);
                solutionCtx.lineTo(px + cellSize - 10, py + cellSize - 10);
                solutionCtx.moveTo(px + cellSize - 10, py + 10);
                solutionCtx.lineTo(px + 10, py + cellSize - 10);
                solutionCtx.stroke();
            } else {
                solutionCtx.fillStyle = '#fff';
                solutionCtx.fillRect(px, py, cellSize, cellSize);
                solutionCtx.strokeStyle = '#bbb';
                solutionCtx.strokeRect(px, py, cellSize, cellSize);
            }
        }
    }

    // 解答経路描画
    solutionCtx.strokeStyle = '#43a047';
    solutionCtx.lineWidth = 8;
    solutionCtx.lineCap = 'round';
    solutionCtx.beginPath();
    for (let i = 0; i < solutionPath.length; i++) {
        const [y, x] = solutionPath[i];
        const cx = boardPadding + x * cellSize + cellSize / 2;
        const cy = boardPadding + y * cellSize + cellSize / 2;
        if (i === 0) solutionCtx.moveTo(cx, cy);
        else solutionCtx.lineTo(cx, cy);
    }
    solutionCtx.stroke();
    solutionCtx.lineWidth = 1;

    // スタート・ゴール描画
    function drawCircle(x, y, color, label) {
        const cx = boardPadding + x * cellSize + cellSize / 2;
        const cy = boardPadding + y * cellSize + cellSize / 2;
        solutionCtx.beginPath();
        solutionCtx.arc(cx, cy, cellSize / 4, 0, Math.PI * 2);
        solutionCtx.fillStyle = color;
        solutionCtx.globalAlpha = 0.5;
        solutionCtx.fill();
        solutionCtx.globalAlpha = 1.0;

        if (label) {
            solutionCtx.save();
            solutionCtx.fillStyle = '#fff';
            solutionCtx.font = `bold ${Math.max(14, Math.floor(cellSize * 0.28))}px sans-serif`;
            solutionCtx.textAlign = 'center';
            solutionCtx.textBaseline = 'middle';
            solutionCtx.fillText(label, cx, cy);
            solutionCtx.restore();
        }
    }

    const [sy, sx] = solutionPath[0];
    const [gy, gx] = solutionPath[solutionPath.length - 1];
    drawCircle(sx, sy, '#43a047', 'S');
    drawCircle(gx, gy, '#d32f2f', 'G');

    // 番号表示
    solutionCtx.fillStyle = '#333';
    solutionCtx.font = 'bold 14px sans-serif';
    solutionCtx.textAlign = 'center';
    solutionCtx.textBaseline = 'middle';
    for (let i = 0; i < solutionPath.length; i++) {
        const [y, x] = solutionPath[i];
        const cx = boardPadding + x * cellSize + cellSize / 2;
        const cy = boardPadding + y * cellSize + cellSize / 2;
        solutionCtx.fillText(i, cx, cy);
    }

    // 情報表示
    solutionInfo.innerHTML = `
        <div class="info-line">スタート: (${startPos[0]}, ${startPos[1]})</div>
        <div class="info-line">ゴール: (${goalPos[0]}, ${goalPos[1]})</div>
        <div class="info-line">通過マス数: ${solutionPath.length}</div>
    `;
}

// モーダルを閉じる
document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.getElementById('solution-modal').style.display = 'none';
});

// オーバーレイクリックで閉じる
document.getElementById('solution-overlay').addEventListener('click', () => {
    document.getElementById('solution-modal').style.display = 'none';
});

// ========== 問題共有機能 ==========

// 問題データをエンコード（Base64形式）
function encodePuzzleData() {
    // 形式: n|障害物位置(カンマ区切り)|スタートy,x|ゴールy,x
    const obstaclePositions = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y][x] === 1) {
                obstaclePositions.push(`${y}.${x}`);
            }
        }
    }
    const data = `${n}|${obstaclePositions.join(',')}|${startPos[0]}.${startPos[1]}|${goalPos[0]}.${goalPos[1]}`;
    // Base64エンコード
    return btoa(encodeURIComponent(data));
}

// 問題データをデコードして復元
function decodePuzzleData(code) {
    try {
        const decoded = decodeURIComponent(atob(code.trim()));
        const parts = decoded.split('|');
        if (parts.length !== 4) throw new Error('Invalid format');

        const size = parseInt(parts[0]);
        if (size < 3 || size > 20) throw new Error('Invalid size');

        const obstacleStrs = parts[1] ? parts[1].split(',') : [];
        const obstacles = new Set();
        for (const obs of obstacleStrs) {
            if (!obs) continue;
            const [y, x] = obs.split('.').map(Number);
            if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
            obstacles.add(`${y},${x}`);
        }

        const [sy, sx] = parts[2].split('.').map(Number);
        const [gy, gx] = parts[3].split('.').map(Number);

        if (!Number.isFinite(sy) || !Number.isFinite(sx) ||
            !Number.isFinite(gy) || !Number.isFinite(gx)) {
            throw new Error('Invalid start/goal');
        }

        return { size, obstacles, start: [sy, sx], goal: [gy, gx] };
    } catch (e) {
        console.error('Decode error:', e);
        return null;
    }
}

// 問題を復元して表示
function loadPuzzleFromData(data) {
    n = data.size;
    sizeSelect.value = n;

    // 盤面を初期化
    board = Array(n).fill(0).map(() => Array(n).fill(0));
    for (const key of data.obstacles) {
        const [y, x] = key.split(',').map(Number);
        if (y >= 0 && y < n && x >= 0 && x < n) {
            board[y][x] = 1;
        }
    }

    startPos = data.start;
    goalPos = data.goal;

    // 解答パスを再計算（DFSで探索）
    solutionPath = findSolutionPath();

    obstacleCount = data.obstacles.size;
    obstacleInput.value = obstacleCount;

    path = [];
    isDrawing = false;
    gameCleared = false;
    messageEl.textContent = '';

    updateCanvasSize();
    updateObstacleMax();
    drawBoard();
    updateDifficultyDisplay();
}

// 解答パスを探索（読み込み時用）
function findSolutionPath() {
    const visited = Array(n).fill(0).map(() => Array(n).fill(false));
    const passableCount = countPassableCells();

    function dfs(y, x, currentPath) {
        if (currentPath.length === passableCount) {
            // ゴールに到達しているか確認
            if (y === goalPos[0] && x === goalPos[1]) {
                return [...currentPath];
            }
            return null;
        }

        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dy, dx] of directions) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 1) continue;
            if (visited[ny][nx]) continue;

            visited[ny][nx] = true;
            currentPath.push([ny, nx]);
            const result = dfs(ny, nx, currentPath);
            if (result) return result;
            currentPath.pop();
            visited[ny][nx] = false;
        }
        return null;
    }

    visited[startPos[0]][startPos[1]] = true;
    return dfs(startPos[0], startPos[1], [startPos]);
}

// 共有モーダルを開く
function openShareModal(mode) {
    if (mode === 'copy') {
        shareModalTitle.textContent = '問題コードをコピー';
        const code = encodePuzzleData();
        shareCodeInput.value = code;
        shareCodeInput.readOnly = true;
        shareCopyBtn.style.display = 'block';
        shareLoadBtn.style.display = 'none';
    } else {
        shareModalTitle.textContent = '問題コードを入力';
        shareCodeInput.value = '';
        shareCodeInput.readOnly = false;
        shareCopyBtn.style.display = 'none';
        shareLoadBtn.style.display = 'block';
    }
    shareModal.style.display = 'block';
    shareCodeInput.focus();
    shareCodeInput.select();
}

// 共有モーダルを閉じる
function closeShareModal() {
    shareModal.style.display = 'none';
}

// 問題コードをコピー
copyPuzzleBtn.addEventListener('click', () => {
    if (isGenerating || !board || !startPos || !goalPos) return;
    openShareModal('copy');
});

// 問題コードを入力
loadPuzzleBtn.addEventListener('click', () => {
    if (isGenerating) return;
    openShareModal('load');
});

// モーダル内コピーボタン
shareCopyBtn.addEventListener('click', async () => {
    const code = shareCodeInput.value;
    try {
        await navigator.clipboard.writeText(code);
        messageEl.textContent = '問題コードをコピーしました！';
    } catch (e) {
        // フォールバック: 選択状態にしてユーザーに手動コピーを促す
        shareCodeInput.select();
        try {
            document.execCommand('copy');
            messageEl.textContent = '問題コードをコピーしました！';
        } catch (e2) {
            messageEl.textContent = '上のコードを長押しでコピーしてください';
        }
    }
    setTimeout(() => {
        if (messageEl.textContent.includes('コピー')) {
            messageEl.textContent = '';
        }
    }, 2000);
    closeShareModal();
});

// モーダル内読み込みボタン
shareLoadBtn.addEventListener('click', () => {
    const code = shareCodeInput.value.trim();
    if (!code) {
        messageEl.textContent = '問題コードを入力してください';
        return;
    }

    const data = decodePuzzleData(code);
    if (!data) {
        messageEl.textContent = '無効な問題コードです';
        return;
    }

    loadPuzzleFromData(data);
    messageEl.textContent = '問題を読み込みました！';
    setTimeout(() => {
        if (messageEl.textContent === '問題を読み込みました！') {
            messageEl.textContent = '';
        }
    }, 2000);
    closeShareModal();
});

// モーダル閉じるボタン
shareCloseBtn.addEventListener('click', closeShareModal);

// オーバーレイクリックで閉じる
shareOverlay.addEventListener('click', closeShareModal);

// ルールモーダルを開く
function openRuleModal() {
    ruleModal.style.display = 'block';
}

// ルールモーダルを閉じる
function closeRuleModal() {
    ruleModal.style.display = 'none';
}

// ルールボタン
ruleBtn.addEventListener('click', openRuleModal);

// ルールモーダル閉じるボタン
closeRuleBtn.addEventListener('click', closeRuleModal);

// ルールオーバーレイクリックで閉じる
ruleOverlay.addEventListener('click', closeRuleModal);

// ダークテーマ切り替え
function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark-theme', isDarkTheme);
    themeBtn.textContent = isDarkTheme ? '☀️ ライト' : '🌙 ダーク';

    // 設定を保存
    try {
        localStorage.setItem('puzzleTheme', isDarkTheme ? 'dark' : 'light');
    } catch (e) {
        // localStorage が使えない場合は無視
    }

    // 盤面を再描画
    drawBoard();
}

// テーマボタン
themeBtn.addEventListener('click', toggleTheme);

// 保存されたテーマを復元
function restoreTheme() {
    try {
        const savedTheme = localStorage.getItem('puzzleTheme');
        if (savedTheme === 'dark') {
            isDarkTheme = true;
            document.body.classList.add('dark-theme');
            themeBtn.textContent = '☀️ ライト';
        }
    } catch (e) {
        // localStorage が使えない場合は無視
    }
}

// 初期化（シンプル版 - 自動再生成なし）
async function regenerateAndDraw() {
    if (isGenerating) return;
    isGenerating = true;
    generationFailed = false;
    messageEl.textContent = '生成中...';
    messageEl.style.color = ''; // デフォルト色に戻す
    sizeSelect.disabled = true;
    obstacleInput.disabled = true;
    regenerateBtn.disabled = true;
    generateWithSettingsBtn.disabled = true;
    hintBtn.disabled = true;
    resetBtn.disabled = true;

    try {
        // 生成待ちの間も盤面が真っ灰にならないよう、暫定盤面を描画
        if (!Array.isArray(board) || board.length !== n) {
            board = Array(n).fill(0).map(() => Array(n).fill(0));
        }
        drawBoard();
        updateDifficultyDisplay();

        await generatePuzzle();

        if (generationFailed) {
            // 失敗時のメッセージ
            messageEl.textContent = '生成に失敗しました。設定を変更してください。';
            messageEl.style.color = '#d32f2f';
        } else {
            // 成功時はメッセージをクリア（調整メッセージがある場合は残す）
            if (!messageEl.textContent.includes('調整')) {
                messageEl.textContent = '';
            }
            messageEl.style.color = '';
        }
    } finally {
        isGenerating = false;
        sizeSelect.disabled = false;
        obstacleInput.disabled = false;
        regenerateBtn.disabled = false;
        generateWithSettingsBtn.disabled = false;
        hintBtn.disabled = false;
        resetBtn.disabled = false;
        drawBoard();
        updateDifficultyDisplay();
    }
}

function shouldRunStressTest() {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.has('stress');
    } catch {
        return false;
    }
}

function getStressTestConfig() {
    const params = new URLSearchParams(window.location.search);
    const runs = Math.max(1, Math.min(5000, parseInt(params.get('runs') ?? '400')));
    const budgetMs = Math.max(200, Math.min(20000, parseInt(params.get('budget') ?? '2400')));

    // sizes: "6,7,8" のように指定可能。未指定なら 6..10。
    let sizes = [6, 7, 8, 9, 10];
    const sizesRaw = params.get('sizes');
    if (sizesRaw) {
        const parsed = sizesRaw
            .split(',')
            .map((s) => parseInt(s.trim()))
            .filter((v) => Number.isFinite(v) && v >= 3 && v <= 30);
        if (parsed.length > 0) sizes = parsed;
    }

    // obs: "min" / "min,mid,max" / "4,6,8" のように指定可能。
    const obsRaw = params.get('obs') ?? 'min,mid,max';

    return { runs, budgetMs, sizes, obsRaw };
}

function cellRing(y, x, size) {
    return Math.min(y, x, size - 1 - y, size - 1 - x);
}

function expectedRingMeanForUniformCells(size) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            sum += cellRing(y, x, size);
            count++;
        }
    }
    return count === 0 ? 0 : sum / count;
}

function obstacleRingMean(nextBoard, size) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (nextBoard[y][x] !== 1) continue;
            sum += cellRing(y, x, size);
            count++;
        }
    }
    return count === 0 ? 0 : sum / count;
}

function parseObstacleTargets(obsRaw, size) {
    const totalCells = size * size;
    const maxObstacles = Math.max(0, totalCells - 2);
    const minObstacles = Math.min(maxObstacles, getMinObstaclesForSize(size));

    const cMin = minObstacles;
    const cMax = Math.min(maxObstacles, getNoBandConstraints(size, maxObstacles).maxObstaclesNoBand);
    const cMid = Math.max(cMin, Math.min(cMax, Math.round((cMin + cMax) / 2)));

    const tokens = (obsRaw ?? 'min,mid,max')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const targets = [];
    for (const t of tokens) {
        if (t === 'min') targets.push(cMin);
        else if (t === 'mid') targets.push(cMid);
        else if (t === 'max') targets.push(cMax);
        else {
            const v = parseInt(t);
            if (Number.isFinite(v)) targets.push(Math.max(0, Math.min(v, cMax)));
        }
    }
    const unique = Array.from(new Set(targets));
    unique.sort((a, b) => a - b);
    return unique.length > 0 ? unique : [cMin];
}

async function runStressTest() {
    const cfg = getStressTestConfig();
    const original = {
        n,
        obstacleCount,
        sizeValue: sizeSelect.value,
        obstacleValue: obstacleInput.value,
    };

    console.groupCollapsed('[stress] 1筆書き生成ストレステスト');
    console.log('config', cfg);
    console.groupEnd();

    messageEl.textContent = `検証中... (stress: runs=${cfg.runs})`;
    sizeSelect.disabled = true;
    obstacleInput.disabled = true;
    regenerateBtn.disabled = true;
    hintBtn.disabled = true;
    resetBtn.disabled = true;

    const summaries = [];
    const startAll = Date.now();

    try {
        for (const size of cfg.sizes) {
            n = size;
            const targets = parseObstacleTargets(cfg.obsRaw, size);

            for (const targetObstacles of targets) {
                let okCount = 0;
                let failCount = 0;
                let invalidCount = 0;
                let totalMs = 0;
                let sumOuterRatio = 0;
                let sumRingMean = 0;

                const expectedOuterRatio = (() => {
                    const totalCells = size * size;
                    const outerCells = size === 1 ? 1 : (size * 4 - 4);
                    return totalCells === 0 ? 0 : outerCells / totalCells;
                })();
                const expectedRingMean = expectedRingMeanForUniformCells(size);

                for (let i = 0; i < cfg.runs; i++) {
                    const t0 = Date.now();
                    const budgets = [
                        Math.min(cfg.budgetMs, Math.max(200, Math.floor(cfg.budgetMs * 0.55))),
                        Math.min(cfg.budgetMs, Math.max(200, Math.floor(cfg.budgetMs * 0.8))),
                        cfg.budgetMs,
                    ];
                    let result = null;
                    for (const b of budgets) {
                        result = await generateRandomPathPuzzle(targetObstacles, b);
                        if (result) break;
                    }
                    totalMs += Date.now() - t0;

                    if (!result) {
                        failCount++;
                    } else {
                        const nextBoard = result.board;
                        const nextPath = result.path;

                        const acceptable = isBoardAcceptable(nextBoard, targetObstacles);
                        const savedBoard = board;
                        board = nextBoard;
                        const valid = isValidSolutionPath(nextPath);
                        board = savedBoard;

                        if (!acceptable || !valid) {
                            invalidCount++;
                        } else {
                            okCount++;
                            const outerObs = (() => {
                                const savedN = n;
                                n = size;
                                const v = countOuterObstacles(nextBoard);
                                n = savedN;
                                return v;
                            })();
                            const outerRatio = targetObstacles === 0 ? 0 : outerObs / targetObstacles;
                            sumOuterRatio += outerRatio;
                            sumRingMean += obstacleRingMean(nextBoard, size);
                        }
                    }

                    if (i % 50 === 0) {
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    }
                }

                const sampleCount = Math.max(1, okCount);
                summaries.push({
                    size,
                    obstacles: targetObstacles,
                    ok: okCount,
                    fail: failCount,
                    invalid: invalidCount,
                    avgMs: Math.round(totalMs / cfg.runs),
                    outerRatioAvg: Math.round((sumOuterRatio / sampleCount) * 1000) / 1000,
                    outerRatioExpected: Math.round(expectedOuterRatio * 1000) / 1000,
                    ringMeanAvg: Math.round((sumRingMean / sampleCount) * 1000) / 1000,
                    ringMeanExpected: Math.round(expectedRingMean * 1000) / 1000,
                });
            }
        }

        // VS Code のシンプルブラウザでは console が見えないことがあるため、要約は画面にも出す
        window.__stressSummaries = summaries;
        const totals = summaries.reduce(
            (acc, s) => {
                acc.ok += s.ok;
                acc.fail += s.fail;
                acc.invalid += s.invalid;
                acc.rows++;
                return acc;
            },
            { ok: 0, fail: 0, invalid: 0, rows: 0 }
        );
        const elapsedMs = Date.now() - startAll;

        console.group('[stress] summary');
        console.table(summaries);
        console.log('elapsedMs', elapsedMs);
        console.log('totals', totals);
        console.groupEnd();

        if (totals.invalid === 0) {
            messageEl.textContent = `検証完了: OK=${totals.ok}, 失敗=${totals.fail}, 違反=${totals.invalid} (経過 ${Math.round(elapsedMs / 1000)}s)`;
        } else {
            messageEl.textContent = `検証NG: OK=${totals.ok}, 失敗=${totals.fail}, 違反=${totals.invalid} (経過 ${Math.round(elapsedMs / 1000)}s) — 詳細は window.__stressSummaries / console`;
        }
    } finally {
        // 元の状態に戻して通常表示へ
        n = original.n;
        obstacleCount = original.obstacleCount;
        sizeSelect.value = original.sizeValue;
        obstacleInput.value = original.obstacleValue;
        sizeSelect.disabled = false;
        obstacleInput.disabled = false;
        regenerateBtn.disabled = false;
        hintBtn.disabled = false;
        resetBtn.disabled = false;
        await regenerateAndDraw();
    }
}

// 画面リサイズ時にキャンバスを再描画（スマホ回転対応）
let resizeTimeout = null;
window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (!isGenerating) {
            updateCanvasSize();
            drawBoard();
        }
    }, 150);
});

// テーマを復元
restoreTheme();

if (shouldRunStressTest()) {
    void runStressTest();
} else {
    // 初期起動時: 1割〜2割の範囲でランダムにお邪魔マス数を設定
    obstacleCount = getRandomInitialObstacles(n);
    obstacleInput.value = obstacleCount;
    void regenerateAndDraw();
}
