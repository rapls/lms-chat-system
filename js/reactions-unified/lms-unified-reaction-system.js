/**
 * LMS統合リアクションシステム v2.0
 * 
 * 既存の8つのリアクションファイルを統合し、
 * 確実で安全な動作を保証する新しいリアクションシステム
 * 
 * @version 2.0.0
 * @since 2025-09-13
 * @author Claude Code
 */

(function($) {
    'use strict';

    // 既存システムの存在確認と保護
    if (typeof window.LMSUnifiedReactionSystem !== 'undefined') {
        return;
    }


    /**
     * 緊急時ロールバックシステム
     * システム障害時に既存システムに即座に戻す
     */
    class EmergencyRollbackSystem {
        constructor() {
            this.originalSystems = {};
            this.isRollbackMode = false;
            this.backupTimestamp = Date.now();
        }

        /**
         * 既存システムのバックアップ
         */
        backupOriginalSystems() {
            try {
                // 既存のリアクション関数をバックアップ
                this.originalSystems.toggleReaction = window.toggleReaction;
                this.originalSystems.toggleThreadReaction = window.toggleThreadReaction;
                this.originalSystems.updateMessageReactions = window.LMSChat?.updateMessageReactions;
                this.originalSystems.updateThreadMessageReactions = window.LMSChat?.updateThreadMessageReactions;
                this.originalSystems.reactionActions = window.LMSChat?.reactionActions;
                this.originalSystems.reactionCore = window.LMSChat?.reactionCore;
                this.originalSystems.reactionUI = window.LMSChat?.reactionUI;
                this.originalSystems.reactionCache = window.LMSChat?.reactionCache;


                return true;
            } catch (error) {
                return false;
            }
        }

        /**
         * 緊急ロールバック実行
         */
        executeEmergencyRollback(reason = 'unknown') {
            if (this.isRollbackMode) {
                return;
            }

            this.isRollbackMode = true;

            try {
                // 既存システムを復元
                if (this.originalSystems.toggleReaction) {
                    window.toggleReaction = this.originalSystems.toggleReaction;
                }
                if (this.originalSystems.toggleThreadReaction) {
                    window.toggleThreadReaction = this.originalSystems.toggleThreadReaction;
                }
                if (this.originalSystems.updateMessageReactions) {
                    window.LMSChat.updateMessageReactions = this.originalSystems.updateMessageReactions;
                }
                if (this.originalSystems.updateThreadMessageReactions) {
                    window.LMSChat.updateThreadMessageReactions = this.originalSystems.updateThreadMessageReactions;
                }

                // 新システムの無効化
                if (window.LMSUnifiedReactionSystem) {
                    window.LMSUnifiedReactionSystem._disabled = true;
                }


                // エラー通知
                $(document).trigger('lms:reaction:rollback', { reason, timestamp: Date.now() });

                return true;
            } catch (error) {
                return false;
            }
        }
    }

    /**
     * システム健全性監視
     */
    class SystemHealthMonitor {
        constructor() {
            this.errorCount = 0;
            this.performanceMetrics = new Map();
            this.healthCheckInterval = null;
            this.alertThreshold = {
                errorRate: 0.05,  // 5%
                responseTime: 2000  // 2秒
            };
        }

        /**
         * 健全性監視開始
         */
        startMonitoring() {
            this.healthCheckInterval = setInterval(() => {
                this.performHealthCheck();
            }, 30000); // 30秒毎

        }

        /**
         * エラー記録
         */
        recordError(operation, error) {
            this.errorCount++;
            const errorRate = this.errorCount / (this.performanceMetrics.size || 1);
            

            // エラー率が閾値を超えた場合
            if (errorRate > this.alertThreshold.errorRate) {
                
                $(document).trigger('lms:reaction:high_error_rate', {
                    errorRate,
                    operation,
                    error
                });
            }
        }

        /**
         * パフォーマンス記録
         */
        recordPerformance(operation, duration) {
            if (!this.performanceMetrics.has(operation)) {
                this.performanceMetrics.set(operation, []);
            }
            
            const metrics = this.performanceMetrics.get(operation);
            metrics.push(duration);

            // 最新100件のみ保持
            if (metrics.length > 100) {
                metrics.shift();
            }

            // 平均応答時間チェック
            const averageTime = metrics.reduce((sum, time) => sum + time, 0) / metrics.length;
            if (averageTime > this.alertThreshold.responseTime) {
            }
        }

        /**
         * 健全性チェック
         */
        performHealthCheck() {
            const healthStatus = {
                timestamp: Date.now(),
                errorCount: this.errorCount,
                operationsCount: this.performanceMetrics.size,
                memoryUsage: this.getMemoryUsage()
            };

            // メモリ使用量チェック
            if (healthStatus.memoryUsage > 50 * 1024 * 1024) { // 50MB
            }

        }

        /**
         * メモリ使用量取得（概算）
         */
        getMemoryUsage() {
            if (window.performance && window.performance.memory) {
                return window.performance.memory.usedJSHeapSize;
            }
            return 0;
        }

        /**
         * 監視停止
         */
        stopMonitoring() {
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
        }
    }

    /**
     * 重複処理防止システム
     */
    class DuplicationPreventionSystem {
        constructor() {
            this.actionLocks = new Map();
            this.processingQueue = new Set();
            this.actionHistory = new Map();
            this.cleanupInterval = null;
        }

        /**
         * 初期化
         */
        init() {
            // 定期的なクリーンアップ
            this.cleanupInterval = setInterval(() => {
                this.cleanupExpiredLocks();
            }, 60000); // 1分毎

        }

        /**
         * 重複チェック
         */
        checkDuplicate(messageId, emoji, source = 'unknown') {
            const lockKey = `${messageId}-${emoji}`;
            const now = Date.now();
            const lastAction = this.actionLocks.get(lockKey);

            // 1秒以内の同一アクションは重複とみなす
            if (lastAction && (now - lastAction.timestamp) < 1000) {
                return true;
            }

            // アクション記録
            this.actionLocks.set(lockKey, {
                timestamp: now,
                source: source
            });

            return false;
        }

        /**
         * 処理中状態の管理
         */
        startProcessing(messageId, emoji) {
            const processingKey = `${messageId}-${emoji}`;
            this.processingQueue.add(processingKey);
            
        }

        /**
         * 処理完了
         */
        finishProcessing(messageId, emoji, success = true) {
            const processingKey = `${messageId}-${emoji}`;
            this.processingQueue.delete(processingKey);
            
            // 履歴記録
            this.actionHistory.set(processingKey, {
                timestamp: Date.now(),
                success: success
            });
            
        }

        /**
         * 処理中かチェック
         */
        isProcessing(messageId, emoji) {
            const processingKey = `${messageId}-${emoji}`;
            return this.processingQueue.has(processingKey);
        }

        /**
         * 期限切れロックのクリーンアップ
         */
        cleanupExpiredLocks() {
            const now = Date.now();
            const expireTime = 5 * 60 * 1000; // 5分

            // アクションロックのクリーンアップ
            for (const [key, action] of this.actionLocks.entries()) {
                if (now - action.timestamp > expireTime) {
                    this.actionLocks.delete(key);
                }
            }

            // 履歴のクリーンアップ
            for (const [key, history] of this.actionHistory.entries()) {
                if (now - history.timestamp > expireTime) {
                    this.actionHistory.delete(key);
                }
            }

        }

        /**
         * システム停止
         */
        shutdown() {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            
            this.actionLocks.clear();
            this.processingQueue.clear();
            this.actionHistory.clear();
            
        }
    }

    /**
     * メイン統合リアクションシステム
     */
    class LMSUnifiedReactionSystem {
        constructor() {
            this.version = '2.0.0';
            this._disabled = false;
            this._initialized = false;
            
            // サブシステム
            this.emergency = new EmergencyRollbackSystem();
            this.monitor = new SystemHealthMonitor();
            this.duplicationPrevention = new DuplicationPreventionSystem();

            // 既存システムとの連携
            this.legacySystems = {};
        }

        /**
         * システム初期化
         */
        async init() {
            if (this._initialized) {
                return false;
            }


            try {
                // 1. 緊急システム準備
                if (!this.emergency.backupOriginalSystems()) {
                    throw new Error('既存システムのバックアップに失敗しました');
                }

                // 2. 既存システムの検出と連携準備
                await this.detectAndIntegrateLegacySystems();

                // 3. サブシステム初期化
                this.duplicationPrevention.init();
                this.monitor.startMonitoring();

                // 4. 統合APIの設置（安全な方法で）
                this.installUnifiedAPI();

                // 5. 初期化完了
                this._initialized = true;
                
                
                // 初期化完了イベント
                $(document).trigger('lms:unified-reaction:initialized', {
                    version: this.version,
                    timestamp: Date.now()
                });

                return true;

            } catch (error) {
                
                // 失敗時は緊急ロールバック
                this.emergency.executeEmergencyRollback('initialization_failed');
                
                return false;
            }
        }

        /**
         * 既存システムの検出と統合準備
         */
        async detectAndIntegrateLegacySystems() {

            // 既存のリアクションシステムを検出
            const detectedSystems = {
                coreModule: window.LMSChat?.reactionCore,
                actionsModule: window.LMSChat?.reactionActions, 
                uiModule: window.LMSChat?.reactionUI,
                cacheModule: window.LMSChat?.reactionCache,
                managerModule: window.LMSChat?.reactionManager,
                mainToggleReaction: window.toggleReaction,
                threadToggleReaction: window.toggleThreadReaction
            };

            // 検出結果をログ出力
            Object.entries(detectedSystems).forEach(([name, system]) => {
                if (system) {
                    this.legacySystems[name] = system;
                } else {
                }
            });

            // 必須システムの確認
            if (!this.legacySystems.mainToggleReaction && !this.legacySystems.actionsModule) {
            }

            return true;
        }

        /**
         * 統合APIの安全な設置
         */
        installUnifiedAPI() {

            // 既存APIを保護しながら新APIを提供
            const originalToggleReaction = window.toggleReaction;
            const originalToggleThreadReaction = window.toggleThreadReaction;

            // 統合toggleReaction
            window.toggleReaction = async (messageId, emoji, options = {}) => {
                return await this.toggleReaction(messageId, emoji, { ...options, isThread: false });
            };

            // 統合toggleThreadReaction
            window.toggleThreadReaction = async (messageId, emoji, options = {}) => {
                return await this.toggleReaction(messageId, emoji, { ...options, isThread: true });
            };

            // LMSChatオブジェクトの拡張
            if (!window.LMSChat) {
                window.LMSChat = {};
            }

            window.LMSChat.unifiedReaction = this;

            // フォールバック関数の設定
            window.toggleReaction._originalFunction = originalToggleReaction;
            window.toggleThreadReaction._originalFunction = originalToggleThreadReaction;

        }

        /**
         * メインのリアクション処理関数
         */
        async toggleReaction(messageId, emoji, options = {}) {
            // システム無効化チェック
            if (this._disabled) {
                return await this.fallbackToLegacySystem(messageId, emoji, options);
            }

            const startTime = performance.now();
            const traceId = this.generateTraceId();

            try {
                // パラメータ検証
                if (!this.validateParameters(messageId, emoji)) {
                    throw new Error('無効なパラメータです');
                }

                // 重複処理チェック
                if (this.duplicationPrevention.checkDuplicate(messageId, emoji, 'unified-system')) {
                    return { success: false, reason: 'duplicate_prevented', traceId };
                }

                // 処理開始
                this.duplicationPrevention.startProcessing(messageId, emoji);


                // 既存システムを使用してリアクション処理
                const result = await this.processReactionWithLegacySystem(messageId, emoji, options);

                // 処理完了
                this.duplicationPrevention.finishProcessing(messageId, emoji, result.success);

                // パフォーマンス記録
                const processingTime = performance.now() - startTime;
                this.monitor.recordPerformance('toggleReaction', processingTime);


                return {
                    success: result.success,
                    data: result.data,
                    processingTime,
                    traceId
                };

            } catch (error) {
                // エラー処理
                this.duplicationPrevention.finishProcessing(messageId, emoji, false);
                this.monitor.recordError('toggleReaction', error);


                // 致命的エラーの場合はロールバック検討
                if (this.isCriticalError(error)) {
                }

                return {
                    success: false,
                    error: error.message,
                    traceId
                };
            }
        }

        /**
         * 既存システムを使用したリアクション処理
         */
        async processReactionWithLegacySystem(messageId, emoji, options = {}) {
            // 最適な既存システムを選択
            let processingFunction = null;

            if (options.isThread && this.legacySystems.threadToggleReaction) {
                processingFunction = this.legacySystems.threadToggleReaction;
            } else if (this.legacySystems.actionsModule?.toggleReaction) {
                processingFunction = this.legacySystems.actionsModule.toggleReaction;
            } else if (this.legacySystems.mainToggleReaction) {
                processingFunction = this.legacySystems.mainToggleReaction;
            } else {
                throw new Error('利用可能な既存リアクションシステムが見つかりません');
            }


            try {
                const result = await processingFunction(messageId, emoji, options.isThread);
                return {
                    success: result !== false,
                    data: result
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        }

        /**
         * 既存システムへのフォールバック
         */
        async fallbackToLegacySystem(messageId, emoji, options = {}) {

            try {
                let fallbackFunction = null;

                if (options.isThread) {
                    fallbackFunction = window.toggleThreadReaction?._originalFunction || 
                                    this.legacySystems.threadToggleReaction;
                } else {
                    fallbackFunction = window.toggleReaction?._originalFunction || 
                                    this.legacySystems.mainToggleReaction;
                }

                if (!fallbackFunction) {
                    throw new Error('フォールバック関数が見つかりません');
                }

                const result = await fallbackFunction(messageId, emoji, options.isThread);
                
                
                return {
                    success: result !== false,
                    fallback: true,
                    data: result
                };

            } catch (error) {
                return {
                    success: false,
                    fallback: true,
                    error: error.message
                };
            }
        }

        /**
         * パラメータ検証
         */
        validateParameters(messageId, emoji) {
            if (!messageId || typeof messageId !== 'string' && typeof messageId !== 'number') {
                return false;
            }

            if (!emoji || typeof emoji !== 'string') {
                return false;
            }

            return true;
        }

        /**
         * 致命的エラー判定
         */
        isCriticalError(error) {
            const criticalMessages = [
                'Cannot read property',
                'TypeError',
                'ReferenceError',
                'Maximum call stack size exceeded'
            ];

            return criticalMessages.some(msg => 
                error.message && error.message.includes(msg)
            );
        }

        /**
         * トレースID生成
         */
        generateTraceId() {
            return 'trace_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
        }

        /**
         * システムシャットダウン
         */
        shutdown() {

            this._disabled = true;

            // サブシステム停止
            this.monitor.stopMonitoring();
            this.duplicationPrevention.shutdown();

            // 既存システム復元
            this.emergency.executeEmergencyRollback('manual_shutdown');

        }

        /**
         * システム状態取得
         */
        getSystemStatus() {
            return {
                version: this.version,
                initialized: this._initialized,
                disabled: this._disabled,
                legacySystems: Object.keys(this.legacySystems),
                errorCount: this.monitor.errorCount,
                timestamp: Date.now()
            };
        }
    }

    // システム初期化
    window.LMSUnifiedReactionSystem = new LMSUnifiedReactionSystem();

    // DOM準備完了後に初期化
    $(document).ready(async function() {
        
        try {
            const initSuccess = await window.LMSUnifiedReactionSystem.init();
            
            if (initSuccess) {
                
                // システム状態をコンソールに出力
            } else {
            }
        } catch (error) {
        }
    });

    // 緊急停止コマンド（デバッグ用）
    window.emergencyStopUnifiedReaction = function() {
        if (window.LMSUnifiedReactionSystem) {
            window.LMSUnifiedReactionSystem.shutdown();
        }
    };

    // システム状態確認コマンド（デバッグ用）
    window.checkUnifiedReactionStatus = function() {
        if (window.LMSUnifiedReactionSystem) {
            const status = window.LMSUnifiedReactionSystem.getSystemStatus();
            return status;
        } else {
            return null;
        }
    };


})(jQuery);