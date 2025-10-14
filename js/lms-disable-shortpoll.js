/**
 * 既存ショートポーリングシステム無効化
 * 
 * 6秒間隔のポーリングを完全に停止し、
 * 新しいロングポーリングシステムとの競合を防ぐ
 * 
 * @version 1.0.0
 */

(function($) {
    'use strict';

    /**
     * ショートポーリング無効化システム
     */
    class ShortPollDisabler {
        constructor() {
            this.disabledIntervals = [];
            this.disabledTimeouts = [];
            this.init();
        }

        init() {
            
            $(document).ready(() => {
                this.disableExistingPolling();
                this.interceptNewPolling();
                this.monitorAndDisable();
            });
        }

        /**
         * 既存のポーリングを無効化
         */
        disableExistingPolling() {
            // 既知のグローバル変数をクリア
            const knownPollingVars = [
                'reactionPollingInterval',
                'threadReactionPollingInterval', 
                'unreadCheckInterval',
                'badgeUpdateInterval',
                'messagePollingInterval',
                'chatPollingInterval',
                'pollInterval',
                'checkInterval',
                'syncInterval',
                'refreshInterval'
            ];

            knownPollingVars.forEach(varName => {
                if (window[varName]) {
                    clearInterval(window[varName]);
                    window[varName] = null;
                }
            });

            // ネームスペース内のインターバルもチェック
            if (window.LMSChat && window.LMSChat.polling) {
                Object.keys(window.LMSChat.polling).forEach(key => {
                    const interval = window.LMSChat.polling[key];
                    if (interval && typeof interval === 'number') {
                        clearInterval(interval);
                        window.LMSChat.polling[key] = null;
                    }
                });
            }

            // 既存のチャットロングポーリングシステムも無効化
            if (window.LMSChat && window.LMSChat.longpoll) {
                if (typeof window.LMSChat.longpoll.stop === 'function') {
                    window.LMSChat.longpoll.stop();
                }
                window.LMSChat.longpoll = null;
            }

            // 古いポーリング関数を無効化
            const oldPollingFunctions = [
                'startPolling',
                'stopPolling',
                'initPolling',
                'beginPolling'
            ];

            oldPollingFunctions.forEach(funcName => {
                if (window.LMSChat && window.LMSChat[funcName]) {
                    window.LMSChat[funcName] = function() {
                        // Debug output removed
                    };
                }
            });
        }

        /**
         * 新しいポーリング設定を傍受
         */
        interceptNewPolling() {
            const originalSetInterval = window.setInterval;
            window.setInterval = (callback, delay, ...args) => {
                if (delay === 6000) {
                    return null; // 無効化
                }

                if (delay >= 3000 && delay <= 10000) {
                    const callbackStr = callback.toString();
                    
                    // リアクション関連のポーリングを検出
                    if (callbackStr.includes('reaction') || 
                        callbackStr.includes('badge') || 
                        callbackStr.includes('unread') ||
                        callbackStr.includes('polling')) {
                        return null;
                    }
                }

                // その他は通常通り実行
                const intervalId = originalSetInterval.call(this, callback, delay, ...args);
                return intervalId;
            };

            const originalSetTimeout = window.setTimeout;
            window.setTimeout = (callback, delay, ...args) => {
                if (delay === 6000) {
                    const callbackStr = callback.toString();
                    if (callbackStr.includes('setTimeout') && 
                        (callbackStr.includes('reaction') || callbackStr.includes('polling'))) {
                        return null;
                    }
                }

                return originalSetTimeout.call(this, callback, delay, ...args);
            };
        }

        /**
         * 継続的な監視と無効化
         */
        monitorAndDisable() {
            setInterval(() => {
                this.disableExistingPolling();
                this.ensureUnifiedLongPollActive();
            }, 3000);

            // グローバルフラグ設定
            window.LMS_SHORTPOLL_DISABLED = true;
            window.LMS_LONGPOLL_ACTIVE = true;

            // 統合ロングポーリングの確実な起動
            this.ensureUnifiedLongPollActive();

            // パフォーマンス監視
            this.monitorPerformance();
        }

        /**
         * 統合ロングポーリングシステムの確実な起動
         */
        ensureUnifiedLongPollActive() {
            if (!window.unifiedLongPoll) {
                // Debug output removed
                return;
            }

            // 統合ロングポーリングが非アクティブの場合は起動
            if (!window.unifiedLongPoll.state?.isActive) {
                try {
                    if (typeof window.unifiedLongPoll.start === 'function') {
                        window.unifiedLongPoll.start();
                    } else if (typeof window.unifiedLongPoll.startPolling === 'function') {
                        window.unifiedLongPoll.startPolling();
                    }
                } catch (error) {
                    // Debug output removed
                }
            }
        }

        /**
         * パフォーマンス監視
         */
        monitorPerformance() {
            let lastActiveIntervals = 0;

            setInterval(() => {
                // アクティブなインターバルの概算数をチェック
                let activeIntervals = 0;
                
                // 簡易的な方法で多数のsetIntervalを検出
                for (let i = 1; i < 1000; i++) {
                    try {
                        clearInterval(i);
                        activeIntervals++;
                    } catch (e) {
                        // エラーは無視
                    }
                }

                if (activeIntervals > lastActiveIntervals + 10) {
                }

                lastActiveIntervals = activeIntervals;
            }, 30000); // 30秒ごと
        }

        /**
         * 緊急停止（デバッグ用）
         */
        emergencyStop() {
            
            for (let i = 1; i <= 1000; i++) {
                clearInterval(i);
                clearTimeout(i);
            }

        }

        /**
         * 統計情報取得
         */
        getStats() {
            return {
                disabledIntervals: this.disabledIntervals.length,
                disabledTimeouts: this.disabledTimeouts.length,
                shortPollDisabled: window.LMS_SHORTPOLL_DISABLED || false,
                longPollActive: window.LMS_LONGPOLL_ACTIVE || false,
                unifiedLongPollActive: !!(window.unifiedLongPoll && window.unifiedLongPoll.state?.isActive),
                timestamp: new Date().toLocaleString()
            };
        }

        /**
         * 移行完了チェック
         */
        checkMigrationComplete() {
            const stats = this.getStats();
            const issues = [];

            // 必須条件のチェック
            if (!stats.shortPollDisabled) {
                issues.push('ショートポーリングがまだ無効化されていません');
            }

            if (!stats.longPollActive) {
                issues.push('ロングポーリングフラグがアクティブになっていません');
            }

            if (!window.unifiedLongPoll) {
                issues.push('統合ロングポーリングシステムが読み込まれていません');
            } else if (!stats.unifiedLongPollActive) {
                issues.push('統合ロングポーリングシステムがアクティブになっていません');
            }

            const migrationComplete = issues.length === 0;

            const report = {
                migrationComplete,
                issues,
                stats,
                recommendations: migrationComplete ? 
                    ['移行が正常に完了しました！'] : 
                    ['上記の問題を解決してください', '必要に応じて手動で統合ロングポーリングを起動してください']
            };

            return report;
        }

        /**
         * 移行レポート表示
         */
        showMigrationReport() {
            const report = this.checkMigrationComplete();
            
            // Debug output removed
            
            if (report.migrationComplete) {
                // Debug output removed
            } else {
                // Debug output removed
                report.issues.forEach(issue => {
                // Debug output removed
            });
            }

            // Debug output removed
            // Performance stats output removed

            // Debug output removed
            report.recommendations.forEach(rec => {
                // Debug output removed
            });

            return report;
        }
    }

    /**
     * 既存システムとの統合防止
     */
    function preventLegacyIntegration() {
        // 既存のロングポーリングシステムを無効化
        if (window.LMSChat && window.LMSChat.longpoll && window.LMSChat.longpoll.stop) {
            window.LMSChat.longpoll.stop();
        }

        // 統合システムを無効化
        if (window.LMSUnifiedLongPoll) {
            window.LMSUnifiedLongPoll = null;
        }

        // マイグレーション機能を無効化
        if (window.LMS_Migration_Controller) {
            window.LMS_Migration_Controller = null;
        }
    }

    /**
     * システム初期化
     */
    $(document).ready(function() {
        // 重複防止
        if (window.ShortPollDisabler) {
            return;
        }

        // レガシーシステム無効化
        preventLegacyIntegration();

        // ショートポーリング無効化システム起動
        const disabler = new ShortPollDisabler();
        
        // グローバル参照
        window.ShortPollDisabler = disabler;
        
        // デバッグ用関数
        window.emergencyStopPolling = () => disabler.emergencyStop();
        window.getDisablerStats = () => disabler.getStats();
        window.checkMigrationComplete = () => disabler.checkMigrationComplete();
        window.showMigrationReport = () => disabler.showMigrationReport();
        
        // 自動で移行レポートを表示
        setTimeout(() => {
            // Debug output removed
            // Debug output removed または window.showMigrationReport()');
            
            // 5秒後に自動でレポート表示
            setTimeout(() => {
                disabler.showMigrationReport();
            }, 5000);
        }, 2000);

    });

})(jQuery);