/**
 * 1筆書きマスパズル - 問題生成アルゴリズム
 * 
 * このファイルはパズルの問題生成に関連するアルゴリズムをまとめています。
 * main.js から分離して管理しやすくしました。
 * 
 * ========================================
 * 自己完結型設計
 * ========================================
 * このファイルは他のAIに相談する際にこのファイルだけを送信すれば
 * アルゴリズムの全体像が理解できるように設計されています。
 * 
 * 【グローバル変数】（main.js で定義、実行時に参照）
 * - n: 盤面サイズ（6〜10の整数）
 * - board: 盤面データ（n×n の2次元配列、0=通行可能、1=障害物）
 * 
 * 【このファイルで定義するユーティリティ関数】
 * - isOuterCell(y, x): 外周セルかどうか判定
 * - isNeighbor(a, b): 2つのセルが隣接しているか判定
 * - shuffleArray(array): 配列をシャッフル（Fisher-Yates法）
 * 
 * 【パズルの仕様】
 * - n×n のグリッド盤面
 * - 一部のマスは障害物（通行不可）
 * - プレイヤーは外周のスタートから外周のゴールまで
 *   全ての通行可能マスを1回ずつ通る経路（ハミルトンパス）を見つける
 */

// ========================================
// ユーティリティ関数（このファイル内で自己完結）
// ========================================

/**
 * 外周セルかどうか判定
 * @param {number} y - 行インデックス
 * @param {number} x - 列インデックス
 * @returns {boolean} 外周セルならtrue
 */
function isOuterCell(y, x) {
    return y === 0 || y === n - 1 || x === 0 || x === n - 1;
}

/**
 * 2つのセルが隣接しているか判定（上下左右）
 * @param {Array} a - セル座標 [y, x]
 * @param {Array} b - セル座標 [y, x]
 * @returns {boolean} 隣接していればtrue
 */
function isNeighbor(a, b) {
    if (!a || !b) return false;
    const [y1, x1] = a, [y2, x2] = b;
    return (Math.abs(y1 - y2) + Math.abs(x1 - x2)) === 1;
}

/**
 * 配列をシャッフル（Fisher-Yates法）
 * @param {Array} array - シャッフルする配列（破壊的変更）
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// ========================================
// 制約・設定関数
// ========================================

/**
 * サイズに応じた最小障害物数を取得
 */
function getMinObstaclesForSize(size) {
    const table = {
        6: 4,
        7: 6,
        8: 8,
        9: 10,
        10: 12,
    };
    return table[size] ?? Math.max(0, Math.floor(size * 1.2));
}

/**
 * ランダムな初期障害物数を取得
 */
function getRandomInitialObstacles(size) {
    const totalCells = size * size;
    const minPercent = Math.ceil(totalCells * 0.1);
    const maxPercent = Math.floor(totalCells * 0.2);

    const minObs = getMinObstaclesForSize(size);
    const maxNoBand = getNoBandConstraints(size, maxPercent).maxObstaclesNoBand;
    const maxObs = Math.min(maxPercent, maxNoBand, totalCells - 2);

    const lower = Math.max(minObs, minPercent);
    const upper = Math.max(lower, maxObs);

    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

/**
 * 「帯状」配置を防ぐための制約を取得
 * @param size 盤面サイズ
 * @param obstacles 障害物数
 * @param relaxLevel 緩和レベル（0=厳格, 1〜3=段階的に緩和）
 */
function getNoBandConstraints(size, obstacles, relaxLevel = 0) {
    const minPassablePerLine = 2;
    const baseMaxRun = Math.max(3, Math.floor(size * 0.6));
    const maxObstacleRun = baseMaxRun + relaxLevel;

    const totalCells = size * size;
    const outerCells = size === 1 ? 1 : (size * 4 - 4);
    const expectedOuter = obstacles * (outerCells / totalCells);

    const outerRatios = [0.7, 0.85, 1.0, 1.2];
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

// ========================================
// 盤面検証関数
// ========================================

/**
 * 盤面内の障害物の最大連続数を計算
 */
function maxObstacleRunInBoard(nextBoard) {
    let maxRun = 0;
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

/**
 * 【パリティチェック】二部グラフの性質を利用
 * 
 * グリッドは市松模様のように白黒に塗れる二部グラフです。
 * ハミルトンパスが存在するためには、白マスと黒マスの数の差が1以下である必要があります。
 * 
 * @param nextBoard 盤面データ
 * @returns {boolean} パリティ条件を満たす場合true
 */
function checkParityCondition(nextBoard) {
    let whiteCount = 0;
    let blackCount = 0;

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] === 0) {
                if ((y + x) % 2 === 0) {
                    whiteCount++;
                } else {
                    blackCount++;
                }
            }
        }
    }

    return Math.abs(whiteCount - blackCount) <= 1;
}

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
// 経路探索ヘルパー関数
// ========================================

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
 */
function orderMovesHeuristic(moves, visited) {
    const scored = moves.map(([y, x]) => ({ y, x, d: onwardDegree(y, x, visited), r: Math.random() }));
    scored.sort((a, b) => (a.d - b.d) || (a.r - b.r));
    return scored.map(({ y, x }) => [y, x]);
}

/**
 * 外周から外周へのセグメントを選択
 */
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

/**
 * 貪欲法で経路を生成
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

/**
 * フォールバック用：確実に解ける蛇行パターン
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
        const dy1 = y1 - y0;
        const dx1 = x1 - x0;
        const dy2 = y2 - y1;
        const dx2 = x2 - x1;
        if (dy1 !== dy2 || dx1 !== dx2) turns++;
    }
    return turns;
}

/**
 * 障害物の連結成分数をカウント
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
            if (Math.abs(i - j) === 1) continue;
            extraAdj++;
        }
    }
    return Math.floor(extraAdj / 2);
}

/**
 * 障害物の配置バランスのペナルティを計算
 */
function computeObstacleBalancePenalty(nextBoard) {
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
 * セルのリング値（外周からの距離）を計算
 */
function cellRing(y, x, size) {
    return Math.min(y, x, size - 1 - y, size - 1 - x);
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
 */
function placeObstaclesCentralRing(nextBoard, targetObstacles) {
    const obstacleCandidates = [];

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
 */
function placeObstaclesCheckerboard(nextBoard, targetObstacles) {
    const candidates = [];

    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if ((y + x) % 2 === 0) {
                const ring = cellRing(y, x, n);
                candidates.push({ y, x, ring });
            }
        }
    }

    candidates.sort((a, b) => {
        const ringDiff = b.ring - a.ring;
        if (ringDiff !== 0) return ringDiff;
        return Math.random() - 0.5;
    });

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
 * 空の盤面で経路を生成し、経路外を障害物とする
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
 * 障害物を先に配置してから経路を探索
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

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (Date.now() - startTime > timeLimitMs) break;
            if (attempt % 15 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

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

            // パリティチェック
            if (!checkParityCondition(nextBoard)) {
                continue;
            }

            board = nextBoard;
            if (!isConnected()) {
                board = savedBoard;
                continue;
            }

            const candidate = generateSolutionPath();
            board = savedBoard;

            if (!candidate) continue;

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
 * 【枝刈り付きバックトラッキング】解答経路を探索
 * 
 * 枝刈り条件:
 * 1. 連結性チェック: 未訪問マスが分断されていないか確認
 * 2. ゴール到達可能性: 外周の未訪問マスがあるか確認
 * 3. 行き止まり検出: 次の手がない場合に即座に引き返す
 */
/**
 * 【最適化版】枝刈り付きバックトラッキングによる経路探索
 * 
 * === 最適化ポイント ===
 * 1. 重いBFS枝刈り（checkConnectivityAndGoalReachability）を廃止
 *    → 代わりに O(1) の「軽量先読み（Fast Lookahead）」を導入
 * 
 * 2. Warnsdorff則の厳格化
 *    → 次数1のマス（Forced Move）があれば即座にそれだけを選択
 *    → ランダム性を排除し、次数順を厳格に適用
 * 
 * 3. ゴール条件の最適化
 *    → 終盤で外周マスへの誘導を強化
 *    → 残り少ない時に外周の未訪問マスがなければ早期打ち切り
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
     * 指定セルの「次数」を計算（未訪問かつ通行可能な隣接マスの数）
     * @param {number} cy - 対象セルのY座標
     * @param {number} cx - 対象セルのX座標
     * @returns {number} 次数（0〜4）
     */
    function getDegree(cy, cx) {
        let degree = 0;
        for (const [dy, dx] of directions) {
            const ny = cy + dy;
            const nx = cx + dx;
            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 1) continue;
            if (visited[ny][nx]) continue;
            degree++;
        }
        return degree;
    }

    /**
     * 【軽量先読み（Fast Lookahead）】
     * 
     * (y, x) から (ny, nx) へ移動したと仮定したとき、
     * (y, x) の「他の」未訪問隣接マスが孤立（次数0）になってしまわないかチェック。
     * 
     * 孤立するマスがあれば、その移動は失敗確定なので枝刈りできる。
     * この処理は周囲を見るだけなので O(1) で完了（BFS O(N^2) より圧倒的に高速）。
     * 
     * @param {number} y - 現在位置Y
     * @param {number} x - 現在位置X
     * @param {number} ny - 移動先Y
     * @param {number} nx - 移動先X
     * @returns {boolean} 移動可能ならtrue、孤立マスが発生するならfalse
     */
    function fastLookahead(y, x, ny, nx) {
        // (ny, nx) に移動すると仮定して一時的にvisitedをセット
        visited[ny][nx] = true;

        // (y, x) の他の隣接未訪問マスをチェック
        for (const [dy, dx] of directions) {
            const adjY = y + dy;
            const adjX = x + dx;
            
            // 移動先自体はスキップ
            if (adjY === ny && adjX === nx) continue;
            
            // 範囲外・障害物・訪問済みはスキップ
            if (adjY < 0 || adjY >= n || adjX < 0 || adjX >= n) continue;
            if (board[adjY][adjX] === 1) continue;
            if (visited[adjY][adjX]) continue;
            
            // この隣接マスの次数を計算（移動後の状態で）
            const degreeAfterMove = getDegree(adjY, adjX);
            
            // 次数0 = 孤立してしまう → この移動は失敗確定
            if (degreeAfterMove === 0) {
                visited[ny][nx] = false; // 元に戻す
                return false;
            }
        }

        visited[ny][nx] = false; // 元に戻す
        return true;
    }

    /**
     * 【追加の軽量枝刈り】外周未訪問マスの存在チェック
     * 
     * 残りマスが少なくなった時点で、外周に未訪問マスがなければ
     * ゴールに到達できないので早期打ち切り。
     * 全盤面をスキャンするが、残り少ない時だけ実行するので負荷は軽い。
     * 
     * @returns {boolean} 外周に未訪問マスがあればtrue
     */
    function hasOuterUnvisited() {
        for (let x = 0; x < n; x++) {
            if (board[0][x] === 0 && !visited[0][x]) return true;
            if (board[n - 1][x] === 0 && !visited[n - 1][x]) return true;
        }
        for (let y = 1; y < n - 1; y++) {
            if (board[y][0] === 0 && !visited[y][0]) return true;
            if (board[y][n - 1] === 0 && !visited[y][n - 1]) return true;
        }
        return false;
    }

    /**
     * バックトラッキング本体（最適化版）
     */
    function backtrack(y, x, pathLength) {
        iterations++;
        if (iterations > maxIterations) return null;

        // === ゴール判定 ===
        if (pathLength === totalPassableCells) {
            // 最終マスが外周ならゴール成功
            if (isOuterCell(y, x)) {
                return true; // パスは visited 配列から復元可能だが、ここでは成功フラグのみ返す
            }
            return null;
        }

        // === 移動候補の収集 ===
        const moves = [];
        for (const [dy, dx] of directions) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 1) continue;
            if (visited[ny][nx]) continue;
            moves.push([ny, nx]);
        }

        // 行き止まり
        if (moves.length === 0) {
            return null;
        }

        // === 残りマス数に応じた軽量枝刈り ===
        const remaining = totalPassableCells - pathLength;
        
        // 残り10マス以下で外周未訪問マスがない → ゴール不可能
        if (remaining <= 10 && remaining > 1) {
            if (!hasOuterUnvisited()) {
                return null;
            }
        }

        // === 各移動候補の次数を計算 + 軽量先読みで枝刈り ===
        const validMoves = [];
        let forcedMove = null; // 次数1のマス（Forced Move）
        
        for (const [ny, nx] of moves) {
            // 軽量先読み: この移動で孤立マスが発生しないかチェック
            if (!fastLookahead(y, x, ny, nx)) {
                continue; // 孤立発生 → この移動は無効
            }
            
            const degree = getDegree(ny, nx);
            
            // === Warnsdorff則の厳格化 ===
            // 次数1のマス = そこに行かないと詰むマス（Forced Move）
            // これが見つかったら、他の選択肢は無視して即座にこれを選ぶ
            if (degree === 1) {
                // 既に別のForced Moveがある場合、矛盾（両方行けない）→ 失敗
                if (forcedMove !== null) {
                    return null;
                }
                forcedMove = { ny, nx, degree };
            }
            
            validMoves.push({ ny, nx, degree });
        }

        // 有効な移動先がない
        if (validMoves.length === 0) {
            return null;
        }

        // === Forced Moveがあれば、それだけを試行 ===
        if (forcedMove !== null) {
            const { ny, nx } = forcedMove;
            visited[ny][nx] = true;
            const result = backtrack(ny, nx, pathLength + 1);
            if (result) return result;
            visited[ny][nx] = false;
            return null;
        }

        // === Warnsdorff則でソート（次数が小さい順、厳格に） ===
        // 同じ次数の場合のみ、外周マスを優先（ゴール候補として価値がある）
        validMoves.sort((a, b) => {
            if (a.degree !== b.degree) {
                return a.degree - b.degree; // 次数昇順（小さい順）
            }
            // 同次数なら外周マスを優先
            const aOuter = isOuterCell(a.ny, a.nx) ? 0 : 1;
            const bOuter = isOuterCell(b.ny, b.nx) ? 0 : 1;
            return aOuter - bOuter;
        });

        // === 各移動先を試行 ===
        for (const { ny, nx } of validMoves) {
            visited[ny][nx] = true;
            const result = backtrack(ny, nx, pathLength + 1);
            if (result) return result;
            visited[ny][nx] = false;
        }

        return null;
    }

    // === メイン処理: 複数のスタート地点を試行 ===
    shuffleArray(outerCells);
    const maxStartAttempts = Math.min(outerCells.length, 8); // 試行回数を少し増やす

    for (let i = 0; i < maxStartAttempts; i++) {
        const startCell = outerCells[i];

        // visited配列をリセット
        for (let yy = 0; yy < n; yy++) {
            for (let xx = 0; xx < n; xx++) {
                visited[yy][xx] = false;
            }
        }
        iterations = 0;

        visited[startCell[0]][startCell[1]] = true;
        const result = backtrack(startCell[0], startCell[1], 1);
        
        if (result) {
            // visited配列からパスを復元
            // （バックトラッキング成功時、visitedには正解パスのマスがtrueになっている）
            // ただし順序が分からないので、再度パスを構築する必要がある
            // → 簡易的に再探索してパスを返す
            return reconstructPath(startCell, totalPassableCells, visited);
        }
    }

    return null;
}

/**
 * visitedフラグからパスを復元する補助関数
 * バックトラッキング成功後、visited配列を使ってパスを再構築
 */
function reconstructPath(startCell, totalCells, visitedSnapshot) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const path = [startCell];
    const used = Array(n).fill(0).map(() => Array(n).fill(false));
    used[startCell[0]][startCell[1]] = true;
    
    let current = startCell;
    
    while (path.length < totalCells) {
        const [y, x] = current;
        let foundNext = false;
        
        for (const [dy, dx] of directions) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
            if (board[ny][nx] === 1) continue;
            if (used[ny][nx]) continue;
            if (!visitedSnapshot[ny][nx]) continue; // 正解パスに含まれるマスのみ
            
            path.push([ny, nx]);
            used[ny][nx] = true;
            current = [ny, nx];
            foundNext = true;
            break;
        }
        
        if (!foundNext) {
            // 復元失敗（理論上起きないはず）
            return null;
        }
    }
    
    return path;
}
