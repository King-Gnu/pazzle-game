/**
 * 1筆書きマスパズル - 問題生成アルゴリズム（超高速版 v2.0）
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
 * 
 * ========================================
 * v2.0 最適化のハイライト
 * ========================================
 * 1. 構成的生成法（Constructive Approach）の導入
 *    - 「解ける経路を先に作り、余白を障害物にする」方式
 *    - 生成失敗率ほぼ0を実現
 * 
 * 2. 解探索（Solver）の劇的最適化
 *    - BFS枝刈り（O(N^2)）を完全廃止
 *    - O(1)局所先読み（孤立点検知）に置換
 *    - Warnsdorff則の厳格化 + Forced Move検出
 * 
 * 3. 障害物配置時の次数制約チェック
 *    - 配置するたびに隣接マスの次数≦1をチェック
 *    - 解なし盤面を生成段階で99%排除
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
class SmartPathGenerator {
    /**
     * @param {number} n - 盤面サイズ
     * @param {Array<Array<number>>} board - 盤面（0=通行可能, 1=障害物）
     * @param {[number, number]} startCell - 開始セル [y, x]
     * @param {number} targetLength - 生成したいパス長（セル数）
     * @param {Function|null} onStep - 可視化用コールバック（nullなら無効）
     */
    constructor(n, board, startCell, targetLength, onStep = null) {
        this.n = n;
        this.board = board;
        this.startCell = startCell;
        this.targetLength = targetLength;
        this.onStep = onStep;

        this.dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        this.visited = new Int8Array(n * n).fill(0);
        this.degrees = new Int8Array(n * n).fill(0);
        this.path = [];

        // 探索の安全弁（基本はヒューリスティックで即決着するが、無限ループ防止）
        this.iterations = 0;
        this.maxIterations = 2_000_000;

        // 初期次数を計算
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (board[y][x] === 0) {
                    this.degrees[y * n + x] = this._calcInitialDegree(y, x);
                }
            }
        }
    }

    /**
     * 可視化フック（onStepがある時だけ呼ばれる）
     * @param {Object} state
     */
    _emitStep(state) {
        if (!this.onStep) return null;
        return this.onStep({
            ...state,
            n: this.n,
            board: this.board,
            path: this.path,
            visited: this.visited,
        });
    }

    _isOuterCell(y, x) {
        return y === 0 || y === this.n - 1 || x === 0 || x === this.n - 1;
    }

    _isValidCell(y, x) {
        return y >= 0 && y < this.n && x >= 0 && x < this.n &&
            this.board[y][x] === 0 && this.visited[y * this.n + x] === 0;
    }

    _calcInitialDegree(y, x) {
        let d = 0;
        for (const [dy, dx] of this.dirs) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= this.n || nx < 0 || nx >= this.n) continue;
            if (this.board[ny][nx] === 1) continue;
            d++;
        }
        return d;
    }

    _updateNeighborDegrees(y, x, delta) {
        for (const [dy, dx] of this.dirs) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= this.n || nx < 0 || nx >= this.n) continue;
            if (this.board[ny][nx] === 1) continue;
            this.degrees[ny * this.n + nx] += delta;
        }
    }

    /**
     * 軽量先読み（孤立点検知）
     * 現在 (cy,cx) から (ny,nx) に移動した時、(cy,cx) の他の未訪問隣接が孤立しないか。
     */
    _checkLookahead(cy, cx, ny, nx) {
        for (const [dy, dx] of this.dirs) {
            const ay = cy + dy;
            const ax = cx + dx;
            if (ay === ny && ax === nx) continue;
            if (!this._isValidCell(ay, ax)) continue;

            // ay,ax が今まさに (cy,cx) に依存している（次数1以下）なら、離れると詰み
            if (this.degrees[ay * this.n + ax] <= 1) return false;
        }
        return true;
    }

    /**
     * 目標長ぴったりのパスを生成して返す（終点は外周）
     * @returns {Array<[number, number]>|null}
     */
    generate() {
        if (!this.startCell) return null;
        if (this.targetLength < 2 || this.targetLength > this.n * this.n) return null;

        const [sy, sx] = this.startCell;
        if (!this._isOuterCell(sy, sx)) return null;
        if (this.board[sy][sx] === 1) return null;

        this.path = [];
        this.visited.fill(0);
        this.iterations = 0;

        // 探索開始
        this.visited[sy * this.n + sx] = 1;
        this.path.push([sy, sx]);
        this._updateNeighborDegrees(sy, sx, -1);

        const ok = this._backtrack(sy, sx);

        // 後始末（再利用や他の呼び出しに影響させない）
        this._updateNeighborDegrees(sy, sx, 1);
        if (!ok) {
            this.path = [];
            this.visited[sy * this.n + sx] = 0;
            return null;
        }
        return this.path.slice();
    }

    /**
     * 可視化用（async版）
     * @returns {Promise<Array<[number, number]>|null>}
     */
    async generateAsync() {
        // 可視化フックが無ければ同期版を使って最速実行
        if (!this.onStep) return this.generate();

        if (!this.startCell) return null;
        if (this.targetLength < 2 || this.targetLength > this.n * this.n) return null;

        const [sy, sx] = this.startCell;
        if (!this._isOuterCell(sy, sx)) return null;
        if (this.board[sy][sx] === 1) return null;

        this.path = [];
        this.visited.fill(0);
        this.iterations = 0;

        // 探索開始
        this.visited[sy * this.n + sx] = 1;
        this.path.push([sy, sx]);
        this._updateNeighborDegrees(sy, sx, -1);
        await this._emitStep({ type: 'start', y: sy, x: sx });
        await this._emitStep({ type: 'visit', y: sy, x: sx });

        const ok = await this._backtrackAsync(sy, sx);

        // 後始末（再利用や他の呼び出しに影響させない）
        this._updateNeighborDegrees(sy, sx, 1);
        if (!ok) {
            this.path = [];
            this.visited[sy * this.n + sx] = 0;
            await this._emitStep({ type: 'fail', y: sy, x: sx });
            return null;
        }
        await this._emitStep({ type: 'success', y: this.path[this.path.length - 1][0], x: this.path[this.path.length - 1][1] });
        return this.path.slice();
    }

    _backtrack(y, x) {
        this.iterations++;
        if (this.iterations > this.maxIterations) return false;

        if (this.path.length === this.targetLength) {
            // 終点は外周、かつ開始点と同一でない
            const [sy, sx] = this.startCell;
            return this._isOuterCell(y, x) && !(y === sy && x === sx);
        }

        const remaining = this.targetLength - this.path.length;

        // 候補収集
        const candidates = [];
        let forcedCount = 0;
        let forced = null;

        for (const [dy, dx] of this.dirs) {
            const ny = y + dy;
            const nx = x + dx;
            if (!this._isValidCell(ny, nx)) continue;

            // 最後の一手は外周に限定（ここで確実に条件を満たす）
            if (remaining === 1 && !this._isOuterCell(ny, nx)) continue;

            if (!this._checkLookahead(y, x, ny, nx)) continue;

            const idx = ny * this.n + nx;
            const d = this.degrees[idx];

            if (d <= 1) {
                forcedCount++;
                forced = { y: ny, x: nx, d };
            }

            candidates.push({ y: ny, x: nx, d });
        }

        if (candidates.length === 0) return false;
        if (forcedCount > 1) return false;

        // Forced Move があればそれだけ
        let toTry = candidates;
        if (forced) {
            toTry = [forced];
        } else {
            // ランダム性を維持しつつ Warnsdorff（次数小）を優先
            shuffleArray(toTry);
            toTry.sort((a, b) => {
                if (a.d !== b.d) return a.d - b.d;
                // 同次数なら外周を「早すぎない」程度に優先（終盤だけ少し寄せる）
                if (remaining <= 6) {
                    const aOuter = this._isOuterCell(a.y, a.x) ? 0 : 1;
                    const bOuter = this._isOuterCell(b.y, b.x) ? 0 : 1;
                    return aOuter - bOuter;
                }
                return 0;
            });
        }

        for (const next of toTry) {
            if (this._tryMove(next.y, next.x)) return true;
        }

        return false;
    }

    /**
     * バックトラッキング本体（async版）
     * @private
     */
    async _backtrackAsync(y, x) {
        this.iterations++;
        if (this.iterations > this.maxIterations) {
            await this._emitStep({ type: 'abort', y, x });
            return false;
        }

        if (this.path.length === this.targetLength) {
            const [sy, sx] = this.startCell;
            const ok = this._isOuterCell(y, x) && !(y === sy && x === sx);
            if (ok) await this._emitStep({ type: 'success', y, x });
            return ok;
        }

        const remaining = this.targetLength - this.path.length;
        const candidates = [];
        let forcedCount = 0;
        let forced = null;

        for (const [dy, dx] of this.dirs) {
            const ny = y + dy;
            const nx = x + dx;
            if (!this._isValidCell(ny, nx)) continue;
            if (remaining === 1 && !this._isOuterCell(ny, nx)) continue;
            if (!this._checkLookahead(y, x, ny, nx)) continue;

            const idx = ny * this.n + nx;
            const d = this.degrees[idx];

            if (d <= 1) {
                forcedCount++;
                forced = { y: ny, x: nx, d };
            }

            candidates.push({ y: ny, x: nx, d });
        }

        if (candidates.length === 0) {
            await this._emitStep({ type: 'deadend', y, x });
            return false;
        }
        if (forcedCount > 1) {
            await this._emitStep({ type: 'contradiction', y, x });
            return false;
        }

        let toTry = candidates;
        if (forced) {
            toTry = [forced];
        } else {
            shuffleArray(toTry);
            toTry.sort((a, b) => {
                if (a.d !== b.d) return a.d - b.d;
                if (remaining <= 6) {
                    const aOuter = this._isOuterCell(a.y, a.x) ? 0 : 1;
                    const bOuter = this._isOuterCell(b.y, b.x) ? 0 : 1;
                    return aOuter - bOuter;
                }
                return 0;
            });
        }

        for (const next of toTry) {
            if (await this._tryMoveAsync(next.y, next.x)) return true;
        }

        return false;
    }

    _tryMove(ny, nx) {
        const idx = ny * this.n + nx;
        this.visited[idx] = 1;
        this.path.push([ny, nx]);
        this._updateNeighborDegrees(ny, nx, -1);

        if (this._backtrack(ny, nx)) return true;

        this._updateNeighborDegrees(ny, nx, 1);
        this.path.pop();
        this.visited[idx] = 0;
        return false;
    }

    /**
     * 移動を試行（async版）
     * @private
     */
    async _tryMoveAsync(ny, nx) {
        const idx = ny * this.n + nx;
        this.visited[idx] = 1;
        this.path.push([ny, nx]);
        this._updateNeighborDegrees(ny, nx, -1);
        await this._emitStep({ type: 'visit', y: ny, x: nx });

        if (await this._backtrackAsync(ny, nx)) return true;

        this._updateNeighborDegrees(ny, nx, 1);
        this.path.pop();
        this.visited[idx] = 0;
        await this._emitStep({ type: 'backtrack', y: ny, x: nx });
        return false;
    }
}

/**
 * 互換ラッパー：旧 generateGreedyWalk を SmartPathGenerator に置換
 */
function generateGreedyWalk(startCell, desiredLength) {
    if (!startCell) return null;
    if (desiredLength < 2 || desiredLength > n * n) return null;

    const gen = new SmartPathGenerator(n, board, startCell, desiredLength);
    return gen.generate();
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
// 【新規】構成的生成法（Constructive Approach）
// ========================================
// 
// 「障害物を置いてから解く」のではなく、
// 「解ける経路を作ってから余白を埋める」ロジック。
// これにより生成失敗率をほぼ0にできる。
//
// アルゴリズム:
// 1. 全面を通行可能とする
// 2. ランダムな全域木または穴掘り法で、全マスを通る一本道を生成（解保証）
// 3. その一本道からランダムにマスを削除して障害物化
// 4. 削除後も解が存在するか高速検証
// ========================================

/**
 * 【構成的生成法】解が保証されるパズルを生成
 * 
 * 手順:
 * 1. 空の盤面でハミルトンパスを生成（全マスを通る一筆書き）
 * 2. パスからランダムにセグメントを抽出（目標の通行可能マス数に）
 * 3. セグメント外を障害物としてマーク
 * 4. 品質チェックを通過すれば完成
 * 
 * @param {number} targetObstacles - 目標の障害物数
 * @param {number} timeBudgetMs - タイムバジェット（ms）
 * @param {number} relaxLevel - 制約緩和レベル
 * @returns {Object|null} { board, path } または null
 */
function generateGuaranteedPuzzle(targetObstacles, timeBudgetMs = 500, relaxLevel = 0) {
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;

    // 最低2マス必要（スタートとゴール）
    if (passableLen < 2) return null;

    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;

    const startTime = Date.now();
    const timeLimitMs = Math.max(100, timeBudgetMs);

    // 外周セルのリスト（スタート候補）
    const outerCells = [];
    for (let x = 0; x < n; x++) {
        outerCells.push([0, x]);
        if (n > 1) outerCells.push([n - 1, x]);
    }
    for (let y = 1; y < n - 1; y++) {
        outerCells.push([y, 0]);
        if (n > 1) outerCells.push([y, n - 1]);
    }
    shuffleArray(outerCells);

    // 盤面は一旦「全通行可能」でパスを作り、パス外を障害物化する
    const savedBoard = board;
    const emptyBoard = Array(n).fill(0).map(() => Array(n).fill(0));
    board = emptyBoard;

    let best = null;
    let bestScore = -Infinity;

    try {
        // 時間内に複数候補を作ってスコアで選ぶ（失敗率を極小化する）
        const maxStarts = Math.min(outerCells.length, 18);
        const perStartTries = 3;

        for (let si = 0; si < maxStarts; si++) {
            if (Date.now() - startTime > timeLimitMs) break;
            const startCell = outerCells[si];

            for (let k = 0; k < perStartTries; k++) {
                if (Date.now() - startTime > timeLimitMs) break;

                const gen = new SmartPathGenerator(n, board, startCell, passableLen);
                const candidate = gen.generate();
                if (!candidate) continue;

                const nextBoard = Array(n).fill(0).map(() => Array(n).fill(1));
                for (const [y, x] of candidate) nextBoard[y][x] = 0;

                // 解としては常に成立するが、品質評価はスコアに反映（不合格でも即棄却しない）
                const acceptable = isBoardAcceptable(nextBoard, targetObstacles, relaxLevel);

                const prev = board;
                board = nextBoard;
                const valid = isValidSolutionPath(candidate);
                board = prev;
                if (!valid) continue;

                const branchEdges = computeBranchEdges(candidate);
                const turns = computeTurnCount(candidate);
                const components = countObstacleComponents(nextBoard);
                const balancePenalty = computeObstacleBalancePenalty(nextBoard);
                const runPenalty = computeRowColRunPenalty(nextBoard);
                const centralityBonus = computeObstacleCentralityBonus(nextBoard, targetObstacles);
                const outerObstacles = countOuterObstacles(nextBoard);
                const outerPenalty = outerObstacles * 3;

                // 不合格の場合はペナルティを付与しつつも、必ず何かを返せるようにする
                const acceptPenalty = acceptable ? 0 : 200;

                const score = branchEdges * 4
                    + turns * 0.18
                    + components * 0.8
                    + centralityBonus * 2.5
                    - balancePenalty * 0.9
                    - runPenalty * 2.2
                    - outerPenalty
                    - acceptPenalty;

                if (score > bestScore) {
                    bestScore = score;
                    best = { board: nextBoard, path: candidate };
                }
            }
        }

        // 最終手段（理論上ほぼ到達しない）: それでも見つからなければ蛇行から抽出
        if (!best) {
            const fullPath = generateSnakePath();
            const segment = pickOuterToOuterSegment(fullPath, passableLen);
            if (segment) {
                const nextBoard = Array(n).fill(0).map(() => Array(n).fill(1));
                for (const [y, x] of segment) nextBoard[y][x] = 0;
                best = { board: nextBoard, path: segment };
            }
        }
    } finally {
        board = savedBoard;
    }

    return best;
}

/**
 * 【構成的生成法 v2】穴掘り法ベースの経路生成
 * 
 * より複雑で面白い経路を生成するための改良版。
 * Warnsdorffヒューリスティックを使って曲がりくねった経路を作る。
 * 
 * @param {number} targetObstacles - 目標の障害物数
 * @param {number} timeBudgetMs - タイムバジェット（ms）
 * @param {number} relaxLevel - 制約緩和レベル
 * @returns {Object|null} { board, path } または null
 */
function generateGuaranteedPuzzleV2(targetObstacles, timeBudgetMs = 500, relaxLevel = 0) {
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;

    if (passableLen < 2) return null;

    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;

    const startTime = Date.now();
    const timeLimitMs = Math.max(100, timeBudgetMs);

    // 外周セルのリスト（スタート候補）
    const outerCells = [];
    for (let x = 0; x < n; x++) {
        outerCells.push([0, x]);
        if (n > 1) outerCells.push([n - 1, x]);
    }
    for (let y = 1; y < n - 1; y++) {
        outerCells.push([y, 0]);
        if (n > 1) outerCells.push([y, n - 1]);
    }

    let best = null;
    let bestScore = -Infinity;
    const maxAttempts = 900;

    // 一時的にboardを空にして経路生成
    const savedBoard = board;
    const emptyBoard = Array(n).fill(0).map(() => Array(n).fill(0));
    board = emptyBoard;

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (Date.now() - startTime > timeLimitMs) break;

            // ランダムな外周セルからスタート
            const startCell = outerCells[Math.floor(Math.random() * outerCells.length)];

            // SmartPathGenerator で「目標長ぴったり」生成（バックトラック付き）
            const candidate = generateGreedyWalk(startCell, passableLen);
            if (!candidate) continue;

            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(1));
            for (const [y, x] of candidate) nextBoard[y][x] = 0;

            const acceptable = isBoardAcceptable(nextBoard, targetObstacles, relaxLevel);

            board = nextBoard;
            const valid = isValidSolutionPath(candidate);
            board = emptyBoard;
            if (!valid) continue;

            const branchEdges = computeBranchEdges(candidate);
            const turns = computeTurnCount(candidate);
            const components = countObstacleComponents(nextBoard);
            const balancePenalty = computeObstacleBalancePenalty(nextBoard);
            const runPenalty = computeRowColRunPenalty(nextBoard);
            const centralityBonus = computeObstacleCentralityBonus(nextBoard, targetObstacles);
            const outerObstacles = countOuterObstacles(nextBoard);
            const outerPenalty = outerObstacles * 3;
            const acceptPenalty = acceptable ? 0 : 200;

            const score = branchEdges * 4
                + turns * 0.2
                + components * 0.8
                + centralityBonus * 2.5
                - balancePenalty * 0.9
                - runPenalty * 2.2
                - outerPenalty
                - acceptPenalty;

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

// ========================================
// 【新規】次数制約チェック付き障害物配置
// ========================================

/**
 * 指定セルの次数（未訪問かつ通行可能な隣接マスの数）を計算
 * 障害物配置の検証に使用
 * 
 * @param {Array} nextBoard - 盤面データ
 * @param {number} y - セルのY座標
 * @param {number} x - セルのX座標
 * @returns {number} 次数（0〜4）
 */
function getCellDegree(nextBoard, y, x) {
    if (nextBoard[y][x] === 1) return 0; // 障害物は次数0

    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let degree = 0;

    for (const [dy, dx] of directions) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
        if (nextBoard[ny][nx] === 0) degree++;
    }

    return degree;
}

/**
 * 【次数制約チェック】障害物を置いても隣接マスが詰まないかチェック
 * 
 * 障害物を置くことで、隣接する空きマスの次数が1以下になると
 * そこは「行き止まり」確定でハミルトンパスが作れない。
 * このチェックで「解なし盤面」を生成段階で99%排除できる。
 * 
 * @param {Array} nextBoard - 盤面データ
 * @param {number} y - 障害物を置くY座標
 * @param {number} x - 障害物を置くX座標
 * @returns {boolean} 配置可能ならtrue
 */
function canPlaceObstacle(nextBoard, y, x) {
    // 既に障害物なら配置済み
    if (nextBoard[y][x] === 1) return false;

    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    // 一時的に障害物を置く
    nextBoard[y][x] = 1;

    // 隣接する空きマスの次数をチェック
    for (const [dy, dx] of directions) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
        if (nextBoard[ny][nx] === 1) continue; // 障害物はスキップ

        const degree = getCellDegree(nextBoard, ny, nx);

        // 次数1以下 = 行き止まり確定（外周のスタート/ゴール候補でない限り）
        // 外周マスは次数1でもスタート/ゴールになれるので許容
        if (degree <= 1 && !isOuterCell(ny, nx)) {
            nextBoard[y][x] = 0; // 元に戻す
            return false;
        }

        // 外周マスでも次数0はダメ
        if (degree === 0) {
            nextBoard[y][x] = 0; // 元に戻す
            return false;
        }
    }

    nextBoard[y][x] = 0; // 元に戻す
    return true;
}

/**
 * 【改良版】次数制約チェック付き障害物配置
 * 
 * 従来のランダム配置に次数制約チェックを追加。
 * これにより解なし盤面の生成を大幅に削減できる。
 * 
 * @param {Array} nextBoard - 盤面データ
 * @param {number} targetObstacles - 目標障害物数
 * @returns {number} 実際に配置した障害物数
 */
function placeObstaclesWithDegreeCheck(nextBoard, targetObstacles) {
    // === 分散配置ロジック（中央リング優先を廃止） ===
    // 1) 配置候補をフラットに列挙して完全シャッフル
    // 2) 次数制約チェック
    // 3) 隣接回避バイアス: 近接（上下左右）に障害物がある場合は高確率で後回し

    const candidates = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            candidates.push([y, x]);
        }
    }
    shuffleArray(candidates);

    // 外周セルの一部を保護（スタート/ゴール候補として）
    const protectedOuter = new Set();
    const outerCells = candidates.filter(([y, x]) => isOuterCell(y, x));
    const minProtected = Math.max(4, Math.floor(n * 0.8));
    shuffleArray(outerCells);
    for (let i = 0; i < Math.min(minProtected, outerCells.length); i++) {
        protectedOuter.add(`${outerCells[i][0]},${outerCells[i][1]}`);
    }

    let placed = 0;
    const deferred = [];
    const adjacencySkipProb = 0.7;

    // 1st pass: 強い隣接回避（後回し）
    for (const [y, x] of candidates) {
        if (placed >= targetObstacles) break;
        if (protectedOuter.has(`${y},${x}`)) continue;

        // 隣接に既存障害物があるなら、高確率でスキップして後回し
        const adjCount = countAdjacentObstacles(nextBoard, y, x);
        if (adjCount >= 2 && Math.random() < 0.6) {
            deferred.push([y, x]);
            continue;
        }

        if (adjCount === 1 && Math.random() < adjacencySkipProb) {
            deferred.push([y, x]);
            continue;
        }

        if (!canPlaceObstacle(nextBoard, y, x)) continue;
        nextBoard[y][x] = 1;
        placed++;
    }

    // 2nd pass: 後回し候補を再挑戦（バイアスを弱める）
    if (placed < targetObstacles && deferred.length) {
        shuffleArray(deferred);
        for (const [y, x] of deferred) {
            if (placed >= targetObstacles) break;
            if (protectedOuter.has(`${y},${x}`)) continue;

            // ここでは少しだけ隣接回避
            const adjCount = countAdjacentObstacles(nextBoard, y, x);
            if (adjCount >= 2 && Math.random() < 0.6) {
                continue;
            }
            if (adjCount === 1 && Math.random() < 0.4) {
                continue;
            }

            if (!canPlaceObstacle(nextBoard, y, x)) continue;
            nextBoard[y][x] = 1;
            placed++;
        }
    }

    // 3rd pass: それでも足りない場合はバイアス無しで埋める（安全弁）
    if (placed < targetObstacles) {
        for (const [y, x] of candidates) {
            if (placed >= targetObstacles) break;
            if (protectedOuter.has(`${y},${x}`)) continue;
            if (nextBoard[y][x] === 1) continue;
            if (!canPlaceObstacle(nextBoard, y, x)) continue;
            nextBoard[y][x] = 1;
            placed++;
        }
    }

    return placed;
}

/**
 * 指定セルの上下左右に障害物があるか
 */
function hasAdjacentObstacle(nextBoard, y, x) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dy, dx] of dirs) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
        if (nextBoard[ny][nx] === 1) return true;
    }
    return false;
}

/**
 * 指定セルの上下左右にある障害物の数を数える（クラスタ抑制用）
 */
function countAdjacentObstacles(nextBoard, y, x) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let count = 0;
    for (const [dy, dx] of dirs) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= n || nx < 0 || nx >= n) continue;
        if (nextBoard[ny][nx] === 1) count++;
    }
    return count;
}

/**
 * 障害物の隣接ペア数（上下左右）を数える（クラスタリングの指標）
 */
function countAdjacentObstaclePairs(nextBoard) {
    let pairs = 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (nextBoard[y][x] !== 1) continue;
            if (y + 1 < n && nextBoard[y + 1][x] === 1) pairs++;
            if (x + 1 < n && nextBoard[y][x + 1] === 1) pairs++;
        }
    }
    return pairs;
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
 * 方式1: 経路優先生成（超高速版 v2.0）
 * 
 * === 改良ポイント ===
 * 1. 最初に構成的生成法（generateGuaranteedPuzzle）を試行
 *    → 解が保証されるため失敗率ほぼ0
 * 2. 時間内に良い結果が得られなければ従来方式にフォールバック
 * 3. 全体として10x10でも100ms以内を目標
 */
async function generateRandomPathPuzzle(targetObstacles, timeBudgetMs, relaxLevel = 0) {
    const totalCells = n * n;
    const passableLen = totalCells - targetObstacles;
    if (passableLen < 2) return null;

    const c = getNoBandConstraints(n, targetObstacles, relaxLevel);
    if (targetObstacles > c.maxObstaclesNoBand) return null;
    if (c.outerMin > c.outerMax) return null;

    const startTime = Date.now();
    const timeLimitMs = Math.max(200, timeBudgetMs ?? 2000);

    // === Phase 1: 分散重視（障害物を先に“散らして”置いて、FastHamiltonSolverで解く） ===
    // FastHamiltonSolver が高速なので、これをメイン戦略にする。
    const phase1Budget = Math.max(80, Math.floor(timeLimitMs * 0.8));
    const phase2Budget = Math.max(50, timeLimitMs - phase1Budget);

    const savedBoard = board;
    let best = null;
    let bestScore = -Infinity;
    const maxAttempts = 2500;

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (Date.now() - startTime > phase1Budget) break;
            if (attempt % 12 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(0));
            const placed = placeObstaclesWithDegreeCheck(nextBoard, targetObstacles);
            if (placed < targetObstacles * 0.9) continue;

            if (!isBoardAcceptable(nextBoard, targetObstacles, relaxLevel)) continue;
            if (!checkParityCondition(nextBoard)) continue;

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
            const adjacencyPairs = countAdjacentObstaclePairs(nextBoard);
            const clumpPenalty = adjacencyPairs * 3.0;

            const score = branchEdges * 4
                + turns * 0.18
                + components * 0.4
                + centralityBonus * 1.2
                - balancePenalty * 0.9
                - runPenalty * 2.2
                - outerPenalty
                - clumpPenalty;

            if (score > bestScore) {
                bestScore = score;
                best = { board: nextBoard, path: candidate };

                // 早期確定はしない（分散しすぎ/固まりすぎの両極を避ける）
            }
        }
    } finally {
        board = savedBoard;
    }

    if (best) return best;

    // === Phase 2: フォールバック（Walker法）===
    // 分散優先のPhase1で見つからない場合のみ、確実に生成できる方式を使う。
    const remainingBudget = Math.max(50, phase2Budget);
    return generateGuaranteedPuzzleV2(targetObstacles, remainingBudget, relaxLevel)
        ?? generateGuaranteedPuzzle(targetObstacles, remainingBudget, relaxLevel);
}

/**
 * 方式2: 障害物先置き生成（次数制約チェック強化版）
 * 
 * 障害物を先に配置してから経路を探索する方式。
 * v2.0では次数制約チェック付き配置関数を優先的に使用し、
 * 解なし盤面の生成を大幅に削減。
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

            // === 戦略選択（次数制約チェック付きを優先） ===
            // 0-2: 次数制約チェック付き配置（高成功率）
            // 3-4: 分散寄りの配置方式（多様性確保）
            const strategy = attempt % 5;
            const nextBoard = Array(n).fill(0).map(() => Array(n).fill(0));

            if (strategy <= 2) {
                // 【新規】次数制約チェック付き配置（解なし盤面を99%排除）
                const placed = placeObstaclesWithDegreeCheck(nextBoard, targetObstacles);
                // 目標数に達しなかった場合はスキップ
                if (placed < targetObstacles * 0.8) continue;
            } else if (strategy === 3) {
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
                + components * 0.4
                + centralityBonus * 3.0
                - balancePenalty * 0.9
                - runPenalty * 2.2
                - outerPenalty
                - clumpPenalty;

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

// ========================================
// 高速ハミルトンパス・ソルバー（クラスベース実装）
// ========================================

/**
 * 高速化されたハミルトンパス・ソルバー
 * 
 * === 最適化の特徴 ===
 * 1. 次数（Degree）を配列で管理し、移動のたびに差分更新（O(1)アクセス）
 * 2. TypedArray（Int8Array）を使用してメモリ効率とGCを最適化
 * 3. 配列の再割り当てを極力排除し、GCを抑制
 * 4. Warnsdorff則とForced Move検出の高速化
 * 5. 軽量先読み（Lookahead）で孤立点を検出
 * 
 * === 従来版との違い ===
 * - 関数呼び出しではなくクラスメソッドでカプセル化
 * - visited/degreesをTypedArrayで保持（メモリ効率向上）
 * - 毎回の配列生成を排除（GC負荷軽減）
 */
class FastHamiltonSolver {
    /**
     * @param {number} n - 盤面サイズ
     * @param {Array<Array<number>>} board - 盤面データ（0=通行可能, 1=障害物）
     * @param {Function|null} onStep - 可視化用コールバック（nullなら無効）
     */
    constructor(n, board, onStep = null) {
        this.n = n;
        this.board = board;
        this.onStep = onStep;
        this.totalPassable = 0;
        this.dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        // TypedArrayを使用してメモリ効率とアクセス速度を向上
        // GC対策として、頻繁に確保・解放される配列をメンバとして保持
        this.visited = new Int8Array(n * n).fill(0);
        this.degrees = new Int8Array(n * n).fill(0);
        this.path = [];
        this.iterations = 0;
        this.maxIterations = 50000;

        // 初期化: 通行可能マス数と初期次数を計算
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (board[y][x] === 0) {
                    this.totalPassable++;
                    this.degrees[y * n + x] = this._calcInitialDegree(y, x);
                }
            }
        }
    }

    /**
     * 可視化フック（onStepがある時だけ呼ばれる）
     * @param {Object} state
     */
    _emitStep(state) {
        if (!this.onStep) return null;
        return this.onStep({
            ...state,
            n: this.n,
            board: this.board,
            path: this.path,
            visited: this.visited,
        });
    }

    /**
     * 初期次数を計算（コンストラクタ内で使用）
     * @private
     */
    _calcInitialDegree(y, x) {
        let d = 0;
        for (const [dy, dx] of this.dirs) {
            const ny = y + dy, nx = x + dx;
            if (this._isValidCell(ny, nx)) d++;
        }
        return d;
    }

    /**
     * セルが有効（範囲内・通行可能・未訪問）かチェック
     * @private
     */
    _isValidCell(y, x) {
        return y >= 0 && y < this.n && x >= 0 && x < this.n &&
            this.board[y][x] === 0 && this.visited[y * this.n + x] === 0;
    }

    /**
     * セルが外周かどうか判定
     * @private
     */
    _isOuterCell(y, x) {
        return y === 0 || y === this.n - 1 || x === 0 || x === this.n - 1;
    }

    /**
     * 次数の動的更新
     * (y, x) を訪問済み/未訪問に変更する際、その隣接マスの次数を更新
     * 
     * @param {number} y - Y座標
     * @param {number} x - X座標
     * @param {number} delta - 変化量（訪問時: -1, 復帰時: +1）
     * @private
     */
    _updateNeighborDegrees(y, x, delta) {
        for (const [dy, dx] of this.dirs) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < this.n && nx >= 0 && nx < this.n &&
                this.board[ny][nx] === 0) {
                this.degrees[ny * this.n + nx] += delta;
            }
        }
    }

    /**
     * 軽量先読み（Lookahead）
     * 
     * (cy, cx) から (ny, nx) に移動したとき、
     * (cy, cx) の他の隣接マスが孤立（次数0 or 次数1で自分だけ）しないかチェック
     * 
     * @param {number} cy - 現在位置Y
     * @param {number} cx - 現在位置X
     * @param {number} ny - 移動先Y
     * @param {number} nx - 移動先X
     * @returns {boolean} 移動可能ならtrue
     * @private
     */
    _checkLookahead(cy, cx, ny, nx) {
        for (const [dy, dx] of this.dirs) {
            const ay = cy + dy, ax = cx + dx;

            // 移動先自体は除外
            if (ay === ny && ax === nx) continue;

            // 有効な隣接マスかチェック
            if (!this._isValidCell(ay, ax)) continue;

            // (ay, ax) は未訪問の隣接マス
            // もし今の次数が1以下なら、(cy, cx) が離れると孤立する
            // 次数1の場合: (cy, cx) からしか到達できない → 孤立
            if (this.degrees[ay * this.n + ax] <= 1) {
                return false;
            }
        }
        return true;
    }

    /**
     * ハミルトンパスを探索
     * @returns {Array|null} 解答パス、または見つからなければ null
     */
    solve() {
        // 外周のスタート候補を収集
        const starts = [];
        for (let y = 0; y < this.n; y++) {
            for (let x = 0; x < this.n; x++) {
                if (this.board[y][x] === 0 && this._isOuterCell(y, x)) {
                    starts.push([y, x]);
                }
            }
        }

        if (starts.length < 2) return null;

        // スタート地点をシャッフル（多様性のため）
        shuffleArray(starts);

        const limit = Math.min(starts.length, 12);
        for (let i = 0; i < limit; i++) {
            const [sy, sx] = starts[i];

            // 状態リセット
            this.path = [];
            this.visited.fill(0);
            this.iterations = 0;

            // 次数を再計算（前回の探索で変更されている可能性があるため）
            this._resetDegrees();

            // 探索開始
            this.visited[sy * this.n + sx] = 1;
            this.path.push([sy, sx]);
            this._updateNeighborDegrees(sy, sx, -1);

            if (this._backtrack(sy, sx)) {
                return this.path.slice(); // パスのコピーを返す
            }

            // 状態を戻す（次のスタート地点のため）
            this._updateNeighborDegrees(sy, sx, 1);
        }

        return null;
    }

    /**
     * 可視化用（async版）
     * @returns {Promise<Array|null>}
     */
    async solveAsync() {
        // 可視化フックが無ければ同期版を使って最速実行
        if (!this.onStep) return this.solve();

        const starts = [];
        for (let y = 0; y < this.n; y++) {
            for (let x = 0; x < this.n; x++) {
                if (this.board[y][x] === 0 && this._isOuterCell(y, x)) {
                    starts.push([y, x]);
                }
            }
        }

        if (starts.length < 2) return null;
        shuffleArray(starts);

        const limit = Math.min(starts.length, 12);
        for (let i = 0; i < limit; i++) {
            const [sy, sx] = starts[i];

            this.path = [];
            this.visited.fill(0);
            this.iterations = 0;
            this._resetDegrees();

            this.visited[sy * this.n + sx] = 1;
            this.path.push([sy, sx]);
            this._updateNeighborDegrees(sy, sx, -1);
            await this._emitStep({ type: 'start', y: sy, x: sx });
            await this._emitStep({ type: 'visit', y: sy, x: sx });

            if (await this._backtrackAsync(sy, sx)) {
                await this._emitStep({ type: 'success', y: this.path[this.path.length - 1][0], x: this.path[this.path.length - 1][1] });
                return this.path.slice();
            }

            this._updateNeighborDegrees(sy, sx, 1);
            await this._emitStep({ type: 'fail', y: sy, x: sx });
        }

        return null;
    }

    /**
     * 次数配列を再計算
     * @private
     */
    _resetDegrees() {
        for (let y = 0; y < this.n; y++) {
            for (let x = 0; x < this.n; x++) {
                if (this.board[y][x] === 0) {
                    this.degrees[y * this.n + x] = this._calcInitialDegree(y, x);
                }
            }
        }
    }

    /**
     * バックトラッキング本体
     * 
     * @param {number} y - 現在位置Y
     * @param {number} x - 現在位置X
     * @returns {boolean} 成功したらtrue
     * @private
     */
    _backtrack(y, x) {
        this.iterations++;
        if (this.iterations > this.maxIterations) return false;

        // ゴール判定: 全マス訪問 & 外周で終了
        if (this.path.length === this.totalPassable) {
            return this._isOuterCell(y, x);
        }

        // === 移動候補の収集と評価 ===
        const candidates = [];
        let forcedMoveCount = 0;
        let forcedMove = null;

        for (const [dy, dx] of this.dirs) {
            const ny = y + dy, nx = x + dx;

            if (!this._isValidCell(ny, nx)) continue;

            // 先読みチェック: 孤立点が発生しないか
            if (!this._checkLookahead(y, x, ny, nx)) continue;

            const deg = this.degrees[ny * this.n + nx];

            // Forced Move検出: 次数1のマスは必ず訪問しなければならない
            if (deg <= 1) {
                forcedMoveCount++;
                forcedMove = { y: ny, x: nx, d: deg };
            }

            candidates.push({ y: ny, x: nx, d: deg });
        }

        // 有効な移動先がない
        if (candidates.length === 0) return false;

        // 複数のForced Moveがある場合は矛盾（詰み）
        if (forcedMoveCount > 1) return false;

        // Forced Moveがあれば、それだけを試行
        if (forcedMove !== null) {
            return this._tryMove(forcedMove.y, forcedMove.x);
        }

        // Warnsdorff則: 次数が小さい順にソート
        // 同次数なら外周マスを優先（ゴール候補として残す）
        candidates.sort((a, b) => {
            if (a.d !== b.d) return a.d - b.d;
            const aOuter = this._isOuterCell(a.y, a.x) ? 0 : 1;
            const bOuter = this._isOuterCell(b.y, b.x) ? 0 : 1;
            return aOuter - bOuter;
        });

        // 各候補を試行
        for (const next of candidates) {
            if (this._tryMove(next.y, next.x)) return true;
        }

        return false;
    }

    /**
     * バックトラッキング本体（async版）
     * @private
     */
    async _backtrackAsync(y, x) {
        this.iterations++;
        if (this.iterations > this.maxIterations) {
            await this._emitStep({ type: 'abort', y, x });
            return false;
        }

        if (this.path.length === this.totalPassable) {
            const ok = this._isOuterCell(y, x);
            if (ok) await this._emitStep({ type: 'success', y, x });
            return ok;
        }

        const candidates = [];
        let forcedMoveCount = 0;
        let forcedMove = null;

        for (const [dy, dx] of this.dirs) {
            const ny = y + dy, nx = x + dx;
            if (!this._isValidCell(ny, nx)) continue;
            if (!this._checkLookahead(y, x, ny, nx)) continue;

            const deg = this.degrees[ny * this.n + nx];
            if (deg <= 1) {
                forcedMoveCount++;
                forcedMove = { y: ny, x: nx, d: deg };
            }
            candidates.push({ y: ny, x: nx, d: deg });
        }

        if (candidates.length === 0) {
            await this._emitStep({ type: 'deadend', y, x });
            return false;
        }
        if (forcedMoveCount > 1) {
            await this._emitStep({ type: 'contradiction', y, x });
            return false;
        }

        if (forcedMove !== null) {
            return this._tryMoveAsync(forcedMove.y, forcedMove.x);
        }

        candidates.sort((a, b) => {
            if (a.d !== b.d) return a.d - b.d;
            const aOuter = this._isOuterCell(a.y, a.x) ? 0 : 1;
            const bOuter = this._isOuterCell(b.y, b.x) ? 0 : 1;
            return aOuter - bOuter;
        });

        for (const next of candidates) {
            if (await this._tryMoveAsync(next.y, next.x)) return true;
        }

        return false;
    }

    /**
     * 移動を試行（訪問 → バックトラック → 復帰）
     * 
     * @param {number} ny - 移動先Y
     * @param {number} nx - 移動先X
     * @returns {boolean} 成功したらtrue
     * @private
     */
    _tryMove(ny, nx) {
        const idx = ny * this.n + nx;

        // 訪問
        this.visited[idx] = 1;
        this.path.push([ny, nx]);
        this._updateNeighborDegrees(ny, nx, -1);

        // 再帰探索
        if (this._backtrack(ny, nx)) return true;

        // バックトラック: 状態を戻す
        this._updateNeighborDegrees(ny, nx, 1);
        this.path.pop();
        this.visited[idx] = 0;

        return false;
    }

    /**
     * 移動を試行（async版）
     * @private
     */
    async _tryMoveAsync(ny, nx) {
        const idx = ny * this.n + nx;
        this.visited[idx] = 1;
        this.path.push([ny, nx]);
        this._updateNeighborDegrees(ny, nx, -1);
        await this._emitStep({ type: 'visit', y: ny, x: nx });

        if (await this._backtrackAsync(ny, nx)) return true;

        this._updateNeighborDegrees(ny, nx, 1);
        this.path.pop();
        this.visited[idx] = 0;
        await this._emitStep({ type: 'backtrack', y: ny, x: nx });

        return false;
    }
}

/**
 * ハミルトンパス探索のラッパー関数
 * 
 * 既存コードとの互換性を維持するため、関数インターフェースを提供。
 * 内部でFastHamiltonSolverクラスを使用。
 * 
 * @param {number} maxIterations - 最大イテレーション数（オプション）
 * @returns {Array|null} 解答パス、または null
 */
function generateSolutionPath(maxIterations) {
    const solver = new FastHamiltonSolver(n, board);
    if (maxIterations) solver.maxIterations = maxIterations;
    return solver.solve();
}