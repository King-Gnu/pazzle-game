/**
 * 1筆書きマスパズル - 問題生成アルゴリズム
 * 
 * このファイルは問題生成に関連するアルゴリズムをまとめたものです。
 * 他のAIにアルゴリズムを理解・改善してもらうために作成しました。
 * 
 * ========================================
 * パズルの概要
 * ========================================
 * - n×n のグリッド盤面
 * - 通行可能マス(0)とお邪魔マス/障害物(1)がある
 * - スタート(S)からゴール(G)まで、すべての通行可能マスを1回ずつ通る経路を見つける
 * - S と G は必ず外周（盤面の端）に配置される
 * - 上下左右にのみ移動可能（斜め移動不可）
 * 
 * ========================================
 * 現在の課題
 * ========================================
 * 1. 大きい盤面(10×10)や障害物が多い場合に生成が失敗しやすい
 * 2. 生成に時間がかかりすぎてフリーズすることがある
 * 3. 生成される問題の質（難易度の適切さ、見た目の良さ）にばらつきがある
 * 
 * ========================================
 * グローバル変数（実際のコードでは外部から参照）
 * ========================================
 */

let n = 6; // 盤面サイズ（6〜10）
let board = []; // 盤面データ: 0=通行可能, 1=お邪魔マス

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 配列をシャッフル（Fisher-Yates）
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * セルが外周（盤面の端）にあるかどうか
 */
function isOuterCell(y, x) {
    return y === 0 || y === n - 1 || x === 0 || x === n - 1;
}

/**
 * セルのリング値（外周からの距離）を計算
 * 外周=0, その1つ内側=1, ...
 */
function cellRing(y, x, size) {
    return Math.min(y, x, size - 1 - y, size - 1 - x);
}

/**
 * 2つのセルが隣接しているか（上下左右）
 */
function isNeighbor(a, b) {
    const [y1, x1] = a, [y2, x2] = b;
    return (Math.abs(y1 - y2) + Math.abs(x1 - x2)) === 1;
}

/**
 * 通行可能マスの数をカウント
 */
function countPassableCells() {
    let count = 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y][x] === 0) count++;
        }
    }
    return count;
}

// ========================================
// パリティチェック（二部グラフの性質）
// ========================================

/**
 * 【改善点1】パリティチェック
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

// ========================================
// 制約チェック関数
// ========================================

/**
 * 盤面の品質制約を取得
 * 「上下帯」のような偏った障害物配置を防ぐための制約
 * 
 * @param size 盤面サイズ
 * @param obstacles 障害物数
 * @param relaxLevel 緩和レベル（0=厳格, 1〜3=段階的に緩和）
 */
function getNoBandConstraints(size, obstacles, relaxLevel = 0) {
    const minPassablePerLine = 2; // 各行/列に最低2つの通行可能マス
    const baseMaxRun = Math.max(3, Math.floor(size * 0.6));
    const maxObstacleRun = baseMaxRun + relaxLevel; // 障害物の連続許容数

    const totalCells = size * size;
    const outerCells = size === 1 ? 1 : (size * 4 - 4);
    const expectedOuter = obstacles * (outerCells / totalCells);

    // 緩和レベルに応じて外周制限を調整
    const outerRatios = [0.7, 0.85, 1.0, 1.2];
    const outerRatio = outerRatios[Math.min(relaxLevel, outerRatios.length - 1)];
    const outerMin = 0;
    const outerMax = Math.min(obstacles, Math.max(2, Math.floor(expectedOuter * outerRatio)));

    const maxObstaclesNoBand = totalCells - minPassablePerLine * size;

    return {
        minPassablePerLine,  // 各行/列に必要な最低通行可能マス数
        maxObstacleRun,      // 障害物の連続配置の最大許容数
        outerMin,            // 外周に配置する障害物の最小数
        outerMax,            // 外周に配置する障害物の最大数
        maxObstaclesNoBand,  // この設定で許容される最大障害物数
    };
}

/**
 * 盤面内の障害物の最大連続数を計算
 */
function maxObstacleRunInBoard(nextBoard) {
    let maxRun = 0;
    // 行方向
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
    // 列方向
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

/**
 * 外周の障害物数をカウント
 */
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

/**
 * 各行/列に最低限の通行可能マスがあるかチェック
 */
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

/**
 * 盤面が品質制約を満たしているかチェック
 */
function isBoardAcceptable(nextBoard, obstacles, relaxLevel = 0) {
    const c = getNoBandConstraints(n, obstacles, relaxLevel);

    if (obstacles > c.maxObstaclesNoBand) return false;
    if (!hasMinPassablePerRowCol(nextBoard, c.minPassablePerLine)) return false;
    if (maxObstacleRunInBoard(nextBoard) > c.maxObstacleRun) return false;

    const outerObs = countOuterObstacles(nextBoard);
    if (outerObs < c.outerMin || outerObs > c.outerMax) return false;

    return true;
}

/**
 * 通行可能マスが連結しているか確認（BFS）
 */
function isConnected() {
    let startCell = null;
    for (let y = 0; y < n && !startCell; y++) {
        for (let x = 0; x < n && !startCell; x++) {
            if (board[y][x] === 0) {
                startCell = [y, x];
            }
        }
    }
    if (!startCell) return false;

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

    let totalPassable = 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (board[y][x] === 0) totalPassable++;
        }
    }

    return visitedCount === totalPassable;
}

// ========================================
// 経路検証・探索関数
// ========================================

/**
 * 解答経路が有効かどうかを検証
 */
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

/**
 * 現在位置から移動可能なマスのリストを取得
 */
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

/**
 * 次の移動先の候補数（Warnsdorffヒューリスティック用）
 */
function onwardDegree(y, x, visited) {
    return getAvailableMoves(y, x, visited).length;
}

/**
 * 移動先をWarnsdorffヒューリスティックでソート
 * 次の手の候補が少ないマスを優先（行き止まりを早く処理）
 */
function orderMovesHeuristic(moves, visited) {
    const scored = moves.map(([y, x]) => ({
        y, x,
        d: onwardDegree(y, x, visited),
        r: Math.random()
    }));
    scored.sort((a, b) => (a.d - b.d) || (a.r - b.r));
    return scored.map(({ y, x }) => [y, x]);
}

/**
 * 貪欲法で経路を生成
 * Warnsdorffヒューリスティックを使用して効率的に探索
 */
function generateGreedyWalk(startCell, desiredLength) {
    if (!startCell) return null;
    if (desiredLength < 2 || desiredLength > n * n) return null;

    const visited = Array(n).fill(0).map(() => Array(n).fill(false));
    const candidatePath = [startCell];
    visited[startCell[0]][startCell[1]] = true;

    while (candidatePath.length < desiredLength) {
        const [y, x] = candidatePath[candidatePath.length - 1];
        const moves = getAvailableMoves(y, x, visited);
        if (moves.length === 0) return null; // 行き詰まり

        const ordered = orderMovesHeuristic(moves, visited);
        const topK = Math.min(3, ordered.length);
        const pick = ordered[Math.floor(Math.random() * topK)]; // 上位3つからランダム選択
        const [ny, nx] = pick;
        visited[ny][nx] = true;
        candidatePath.push([ny, nx]);
    }

    const [gy, gx] = candidatePath[candidatePath.length - 1];
    if (!isOuterCell(gy, gx)) return null; // ゴールが外周でない
    if (gy === startCell[0] && gx === startCell[1]) return null;
    return candidatePath;
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
     * 
     * @param startY 探索開始Y座標
     * @param startX 探索開始X座標
     * @param currentY 現在位置Y（連結チェックの起点）
     * @param currentX 現在位置X
     * @returns {connected: boolean, hasOuterUnvisited: boolean, unvisitedCount: number}
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

/**
 * 蛇行パターンで確実に解ける経路を生成（フォールバック用）
 */
function generateSnakePath() {
    const result = [];
    let dir = 1;

    for (let y = 0; y < n; y++) {
        if (dir === 1) {
            for (let x = 0; x < n; x++) {
                result.push([y, x]);
            }
        } else {
            for (let x = n - 1; x >= 0; x--) {
                result.push([y, x]);
            }
        }
        dir *= -1;
    }

    return result;
}

// ========================================
// スコアリング関数（問題の質を評価）
// ========================================

/**
 * 経路の曲がり角の数を計算
 */
function computeTurnCount(candidatePath) {
    if (!candidatePath || candidatePath.length < 3) return 0;
    let turns = 0;
    for (let i = 2; i < candidatePath.length; i++) {
        const [y0, x0] = candidatePath[i - 2];
        const [y1, x1] = candidatePath[i - 1];
        const [y2, x2] = candidatePath[i];
        const dy1 = y1 - y0, dx1 = x1 - x0;
        const dy2 = y2 - y1, dx2 = x2 - x1;
        if (dy1 !== dy2 || dx1 !== dx2) turns++;
    }
    return turns;
}

/**
 * 障害物の連結成分数をカウント
 * 散らばっているほど成分数が多い
 */
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

/**
 * 分岐エッジ数を計算（迷いやすさの指標）
 * 経路上で隣接しているが連続していない箇所の数
 */
function computeBranchEdges(candidatePath) {
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
            if (Math.abs(i - j) === 1) continue; // 経路上で連続
            extraAdj++;
        }
    }
    return Math.floor(extraAdj / 2);
}

/**
 * 障害物の配置バランスのペナルティを計算
 * 4象限と外周/内側の偏りを評価
 */
function computeObstacleBalancePenalty(nextBoard) {
    const mid = Math.floor(n / 2);
    const q = [0, 0, 0, 0]; // 4象限
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

/**
 * 行/列の障害物集中ペナルティを計算
 */
function computeRowColRunPenalty(nextBoard) {
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

/**
 * 全セルの平均リング値（一様分布の場合）
 */
function expectedRingMeanForUniformCells(size) {
    let sum = 0, count = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            sum += cellRing(y, x, size);
            count++;
        }
    }
    return count === 0 ? 0 : sum / count;
}

/**
 * 障害物の平均リング値を計算
 */
function obstacleRingMean(nextBoard, size) {
    let sum = 0, count = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (nextBoard[y][x] !== 1) continue;
            sum += cellRing(y, x, size);
            count++;
        }
    }
    return count === 0 ? 0 : sum / count;
}

/**
 * 障害物の中央配置ボーナスを計算
 * 中央寄りに配置されているほどボーナス
 */
function computeObstacleCentralityBonus(nextBoard, obstacles) {
    if (!obstacles || obstacles <= 0) return 0;
    const mean = obstacleRingMean(nextBoard, n);
    const expected = expectedRingMeanForUniformCells(n);
    return (mean - expected) * obstacles * 2.5;
}

// ========================================
// 障害物配置戦略
// ========================================

/**
 * 戦略A: 中央リング優先配置
 * 中央から外側に向かって障害物を配置
 */
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

    let placed = 0;
    for (const [y, x] of obstacleCandidates) {
        if (placed >= targetObstacles) break;
        if (protectedOuter.has(`${y},${x}`)) continue;
        nextBoard[y][x] = 1;
        placed++;
    }
}

/**
 * 戦略B: 市松模様ベースの分散配置
 * 市松模様のパターンを基に障害物を配置
 */
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

/**
 * 戦略C: 完全ランダム配置（外周保護のみ）
 */
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

// ========================================
// メイン生成アルゴリズム
// ========================================

/**
 * 方式1: 経路優先生成
 * 
 * アルゴリズム:
 * 1. 空の盤面でGreedyWalkを使って経路を生成
 * 2. 経路上のマスを通行可能、それ以外を障害物として盤面を作成
 * 3. 盤面が制約を満たすかチェック
 * 4. スコアリングして最良の結果を保持
 * 
 * 長所: 経路が必ず存在することが保証される
 * 短所: 障害物の配置が経路の形状に依存する
 */
async function generateRandomPathPuzzle(targetObstacles, timeBudgetMs, relaxLevel = 0) {
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;
    if (passableLen < 2) return null;

    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;
    if (c.outerMin > c.outerMax) return null;

    const savedBoard = board;
    const emptyBoard = Array(n).fill(0).map(() => Array(n).fill(0));
    board = emptyBoard;

    const base = generateSnakePath();
    const outerStarts = base.filter(([y, x]) => isOuterCell(y, x));
    shuffleArray(outerStarts);

    const startTime = Date.now();
    const timeLimitMs = Math.max(200, timeBudgetMs ?? 2000);
    const maxRestarts = 5000;

    let best = null;
    let bestScore = -Infinity;

    try {
        for (let attempt = 0; attempt < maxRestarts; attempt++) {
            if (Date.now() - startTime > timeLimitMs) break;

            // フリーズ防止: 定期的にUIスレッドに制御を戻す
            if (attempt % 20 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            const startCell = outerStarts[Math.floor(Math.random() * outerStarts.length)];
            const candidate = generateGreedyWalk(startCell, passableLen);
            if (!candidate) continue;

            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(1));
            for (const [y, x] of candidate) nextBoard[y][x] = 0;

            if (!isBoardAcceptable(nextBoard, targetObstacles, relaxLevel)) continue;

            board = nextBoard;
            const ok = isValidSolutionPath(candidate);
            board = emptyBoard;
            if (!ok) continue;

            // スコアリング
            const branchEdges = computeBranchEdges(candidate);
            const turns = computeTurnCount(candidate);
            const components = countObstacleComponents(nextBoard);
            const balancePenalty = computeObstacleBalancePenalty(nextBoard);
            const runPenalty = computeRowColRunPenalty(nextBoard);
            const centralityBonus = computeObstacleCentralityBonus(nextBoard, targetObstacles);
            const outerObstacles = countOuterObstacles(nextBoard);
            const outerPenalty = outerObstacles * 3;

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

    return best;
}

/**
 * 方式2: 障害物先置き生成
 * 
 * アルゴリズム:
 * 1. 障害物配置戦略（A/B/C）を使って盤面を作成
 * 2. 通行可能マスが連結しているかチェック
 * 3. DFSで解答経路を探索
 * 4. スコアリングして最良の結果を保持
 * 
 * 長所: 障害物の配置を直接制御できる
 * 短所: 経路が存在しない盤面が生成される可能性がある
 */
async function generateObstacleFirstPuzzle(targetObstacles, timeBudgetMs, relaxLevel = 0) {
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;
    if (passableLen < 2) return null;

    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;

    const savedBoard = board;
    const startTime = Date.now();
    const timeLimitMs = Math.max(200, timeBudgetMs ?? 2000);
    const maxAttempts = 3000;

    let best = null;
    let bestScore = -Infinity;

    // 統計情報（デバッグ用）
    let paritySkipped = 0;
    let connectivitySkipped = 0;

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (Date.now() - startTime > timeLimitMs) break;

            // フリーズ防止
            if (attempt % 15 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            // 複数の配置戦略をローテーション
            const strategy = attempt % 3;
            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(0));

            if (strategy === 0) {
                placeObstaclesCentralRing(nextBoard, targetObstacles);
            } else if (strategy === 1) {
                placeObstaclesCheckerboard(nextBoard, targetObstacles);
            } else {
                placeObstaclesRandom(nextBoard, targetObstacles);
            }

            if (!isBoardAcceptable(nextBoard, targetObstacles, relaxLevel)) continue;

            // 【改善点1】パリティチェック
            // 障害物配置直後に、白マスと黒マスの数の差をチェック
            // 差が2以上の場合、数学的にハミルトンパスは存在しないため、
            // 経路探索を行わずに即座に次の試行へ移る
            if (!checkParityCondition(nextBoard)) {
                paritySkipped++;
                continue; // 経路探索をスキップして次の試行へ
            }

            board = nextBoard;
            if (!isConnected()) {
                board = savedBoard;
                connectivitySkipped++;
                continue;
            }

            const candidate = generateSolutionPath();
            board = savedBoard;

            if (!candidate) continue;

            // スコアリング
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
                + centralityBonus * 3.0
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

/**
 * メイン生成関数
 * 複数の戦略を段階的に試行して問題を生成
 */
async function generatePuzzle(targetObstacles) {
    const totalCells = n * n;
    let result = null;

    // 全体の時間制限（8秒）
    const globalStartTime = Date.now();
    const globalTimeLimit = 8000;
    const isTimeUp = () => Date.now() - globalStartTime > globalTimeLimit;

    // サイズに応じた時間予算
    const baseBudget = 1000 + (n - 6) * 500;
    const budgets = [
        Math.min(2000, baseBudget),
        Math.min(4000, baseBudget * 1.5),
    ];

    // 戦略1: 両方の生成方式を段階的に試行
    for (const budget of budgets) {
        if (isTimeUp()) break;
        await new Promise(resolve => setTimeout(resolve, 0));

        result = await generateRandomPathPuzzle(targetObstacles, budget, 0);
        if (result) break;
        if (isTimeUp()) break;

        result = await generateObstacleFirstPuzzle(targetObstacles, budget, 0);
        if (result) break;
    }

    // 戦略2: 制約を段階的に緩和
    if (!result && !isTimeUp()) {
        for (let relaxLevel = 1; relaxLevel <= 2; relaxLevel++) {
            if (isTimeUp()) break;
            await new Promise(resolve => setTimeout(resolve, 0));

            const relaxBudget = Math.min(2000, baseBudget);
            result = await generateRandomPathPuzzle(targetObstacles, relaxBudget, relaxLevel);
            if (result) break;
            if (isTimeUp()) break;

            result = await generateObstacleFirstPuzzle(targetObstacles, relaxBudget, relaxLevel);
            if (result) break;
        }
    }

    // 戦略3: 障害物数を動的に減らして再試行
    if (!result && !isTimeUp()) {
        const minGuarantee = Math.floor(totalCells * 0.08);
        let reducedObstacles = targetObstacles;

        while (!result && reducedObstacles > minGuarantee && !isTimeUp()) {
            await new Promise(resolve => setTimeout(resolve, 0));
            reducedObstacles = Math.max(minGuarantee, reducedObstacles - 2);
            const reduceBudget = Math.min(1500, baseBudget * 0.5);

            result = await generateRandomPathPuzzle(reducedObstacles, reduceBudget, 0);
            if (!result && !isTimeUp()) {
                result = await generateObstacleFirstPuzzle(reducedObstacles, reduceBudget, 0);
            }
        }
    }

    return result; // { board, path } または null
}

// ========================================
// エクスポート（他のファイルから使用する場合）
// ========================================
// module.exports = { generatePuzzle, generateRandomPathPuzzle, generateObstacleFirstPuzzle, ... };
