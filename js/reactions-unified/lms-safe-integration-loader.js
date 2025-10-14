/**
 * LMS安全統合ローダー
 * 
 * 既存システムを保護しながら新統合システムを段階的に導入
 * 
 * @version 1.0.0
 * @since 2025-09-13
 */

(function($) {
    'use strict';

    // 既に実行されている場合は重複実行を防止
    if (typeof window.LMSSafeIntegrationLoader !== 'undefined') {
        return;
    }


    /**
     * 安全統合ローダークラス
     */
    class LMSSafeIntegrationLoader {
        constructor() {
            this.integrationMode = 'safe'; // safe, testing, production
            this.enableNewSystem = false;
            this.checkInterval = null;
            this.maxInitAttempts = 3;
            this.initAttempts = 0;
        }

        /**
         * 統合開始
         */
        async startIntegration() {

            try {
                // 1. 環境チェック
                if (!this.checkEnvironment()) {
                    throw new Error('環境チェックに失敗しました');
                }

                // 2. 既存システム状態確認
                await this.verifyExistingSystems();

                // 3. 統合モード決定
                this.determineIntegrationMode();

                // 4. 新システム読み込み (統合モードに応じて)
                if (this.enableNewSystem) {
                    await this.loadUnifiedSystem();
                } else {
                }

                // 5. 監視開始
                this.startMonitoring();


            } catch (error) {
                this.handleIntegrationFailure(error);
            }
        }

        /**
         * 環境チェック
         */
        checkEnvironment() {

            // 必須ライブラリの確認
            if (typeof jQuery === 'undefined') {
                return false;
            }

            if (typeof window.lmsChat === 'undefined') {
            }

            // ブラウザサポートチェック
            if (!window.Promise || !window.Map || !window.Set) {
                return false;
            }

            return true;
        }

        /**
         * 既存システム状態確認
         */
        async verifyExistingSystems() {

            const systemCheck = {
                toggleReaction: typeof window.toggleReaction === 'function',
                toggleThreadReaction: typeof window.toggleThreadReaction === 'function',
                LMSChatReactions: !!(window.LMSChat && window.LMSChat.reactions),
                reactionCore: !!(window.LMSChat && window.LMSChat.reactionCore),
                reactionActions: !!(window.LMSChat && window.LMSChat.reactionActions),
                reactionUI: !!(window.LMSChat && window.LMSChat.reactionUI)
            };


            // 基本的なリアクション機能があるかチェック
            const hasBasicReaction = systemCheck.toggleReaction || systemCheck.reactionActions;
            
            if (!hasBasicReaction) {
                // 新システムを有効化して基本機能を提供
                this.enableNewSystem = true;
            } else {
            }

            return systemCheck;
        }

        /**
         * 統合モード決定
         */
        determineIntegrationMode() {
            // URL パラメータで強制モード指定が可能
            const urlParams = new URLSearchParams(window.location.search);
            const forceMode = urlParams.get('reaction_mode');

            if (forceMode === 'unified') {
                this.integrationMode = 'testing';
                this.enableNewSystem = true;
                return;
            }

            if (forceMode === 'legacy') {
                this.integrationMode = 'safe';
                this.enableNewSystem = false;
                return;
            }

            // localStorage の設定確認
            const userPreference = localStorage.getItem('lms_reaction_mode');
            
            if (userPreference === 'unified') {
                this.integrationMode = 'testing';
                this.enableNewSystem = true;
                return;
            }

            // デフォルトは安全モード
            this.integrationMode = 'safe';
            
            // 特定の条件下でのみ新システムを有効化
            // （例：開発環境、テストユーザー、など）
            if (this.isTestEnvironment()) {
                this.enableNewSystem = true;
            }
        }

        /**
         * テスト環境判定
         */
        isTestEnvironment() {
            // 開発環境の判定ロジック
            const isDevelopment = window.location.hostname === 'localhost' || 
                                window.location.hostname.includes('local') ||
                                window.location.hostname.includes('dev') ||
                                window.location.hostname.includes('test');

            // デバッグモードの判定
            const isDebugMode = window.location.search.includes('debug=true') ||
                              localStorage.getItem('lms_debug_mode') === 'true';

            return isDevelopment || isDebugMode;
        }

        /**
         * 統合システム読み込み
         */
        async loadUnifiedSystem() {

            try {
                // スクリプトが既に読み込まれているかチェック
                if (typeof window.LMSUnifiedReactionSystem !== 'undefined') {
                    return true;
                }

                // 動的スクリプト読み込み
                await this.loadScript('/wp-content/themes/lms/js/reactions-unified/lms-unified-reaction-system.js');

                // 初期化を待機
                await this.waitForSystemInitialization();

                return true;

            } catch (error) {
                throw error;
            }
        }

        /**
         * スクリプト動的読み込み
         */
        loadScript(src) {
            return new Promise((resolve, reject) => {
                // 既に読み込まれているスクリプトかチェック
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`スクリプト読み込み失敗: ${src}`));
                
                document.head.appendChild(script);
            });
        }

        /**
         * システム初期化待機
         */
        async waitForSystemInitialization() {
            const maxWaitTime = 10000; // 10秒
            const checkInterval = 100;  // 100ms
            let waitTime = 0;

            return new Promise((resolve, reject) => {
                const checkInit = () => {
                    if (typeof window.LMSUnifiedReactionSystem !== 'undefined' && 
                        window.LMSUnifiedReactionSystem._initialized) {
                        resolve();
                        return;
                    }

                    waitTime += checkInterval;
                    if (waitTime >= maxWaitTime) {
                        reject(new Error('システム初期化がタイムアウトしました'));
                        return;
                    }

                    setTimeout(checkInit, checkInterval);
                };

                checkInit();
            });
        }

        /**
         * 監視開始
         */
        startMonitoring() {

            // 定期的な健全性チェック
            this.checkInterval = setInterval(() => {
                this.performHealthCheck();
            }, 60000); // 1分毎

            // エラーイベントリスナー
            $(document).on('lms:reaction:rollback', (event, data) => {
                this.handleSystemRollback(data);
            });

            // 高エラー率アラート
            $(document).on('lms:reaction:high_error_rate', (event, data) => {
                this.handleHighErrorRate(data);
            });
        }

        /**
         * 健全性チェック
         */
        performHealthCheck() {
            const status = {
                timestamp: Date.now(),
                toggleReactionAvailable: typeof window.toggleReaction === 'function',
                unifiedSystemActive: !!(window.LMSUnifiedReactionSystem && !window.LMSUnifiedReactionSystem._disabled),
                mode: this.integrationMode
            };


            // 異常検出時の対応
            if (!status.toggleReactionAvailable) {
                this.handleCriticalError('toggleReaction関数が見つからない');
            }
        }

        /**
         * システムロールバック処理
         */
        handleSystemRollback(data) {

            // ユーザーに通知
            this.showUserNotification('リアクションシステムが一時的に既存モードに戻りました', 'warning');

            // モード更新
            this.integrationMode = 'rollback';
            this.enableNewSystem = false;
        }

        /**
         * 高エラー率処理
         */
        handleHighErrorRate(data) {

            // 新システムを一時的に無効化
            if (window.LMSUnifiedReactionSystem) {
                window.LMSUnifiedReactionSystem._disabled = true;
            }

            // ユーザーに通知
            this.showUserNotification('リアクション機能で問題が検出されました。自動的に修復中です', 'info');
        }

        /**
         * 致命的エラー処理
         */
        handleCriticalError(error) {

            // 緊急復旧試行
            this.attemptEmergencyRecovery();
        }

        /**
         * 緊急復旧試行
         */
        attemptEmergencyRecovery() {

            this.initAttempts++;
            
            if (this.initAttempts > this.maxInitAttempts) {
                this.showUserNotification('リアクション機能に問題が発生しています。ページを再読み込みしてください', 'error');
                return;
            }

            // 少し遅らせて再初期化試行
            setTimeout(() => {
                this.startIntegration();
            }, 2000);
        }

        /**
         * ユーザー通知表示
         */
        showUserNotification(message, type = 'info') {
            // 既存の通知システムがあるかチェック
            if (window.LMSChat && typeof window.LMSChat.utils?.showError === 'function') {
                if (type === 'error') {
                    window.LMSChat.utils.showError(message);
                } else {
                }
            } else {
                // フォールバック通知
                
                // 簡易通知バー表示
                this.showSimpleNotification(message, type);
            }
        }

        /**
         * 簡易通知バー表示
         */
        showSimpleNotification(message, type) {
            // 既存の通知バーがあるかチェック
            let $notification = $('#lms-system-notification');
            
            if ($notification.length === 0) {
                $notification = $(`
                    <div id="lms-system-notification" style="
                        position: fixed; 
                        top: 20px; 
                        right: 20px; 
                        z-index: 10000; 
                        background: #333; 
                        color: white; 
                        padding: 12px 16px; 
                        border-radius: 4px; 
                        font-size: 14px;
                        max-width: 300px;
                        opacity: 0;
                        transform: translateY(-20px);
                        transition: all 0.3s ease;
                    "></div>
                `);
                $('body').append($notification);
            }

            // タイプに応じた色設定
            let backgroundColor = '#333';
            if (type === 'error') backgroundColor = '#d32f2f';
            if (type === 'warning') backgroundColor = '#f57c00';
            if (type === 'info') backgroundColor = '#1976d2';

            $notification
                .css('background-color', backgroundColor)
                .text(message)
                .css({ opacity: 1, transform: 'translateY(0)' });

            // 5秒後に自動で非表示
            setTimeout(() => {
                $notification.css({ opacity: 0, transform: 'translateY(-20px)' });
                setTimeout(() => $notification.remove(), 300);
            }, 5000);
        }

        /**
         * 統合失敗処理
         */
        handleIntegrationFailure(error) {
            
            // 既存システムが利用可能か最終確認
            if (typeof window.toggleReaction === 'function') {
                this.showUserNotification('リアクション機能は既存システムで継続します', 'info');
            } else {
                this.showUserNotification('リアクション機能が利用できません。ページを再読み込みしてください', 'error');
            }
        }

        /**
         * 統合状態取得
         */
        getIntegrationStatus() {
            return {
                mode: this.integrationMode,
                enableNewSystem: this.enableNewSystem,
                initAttempts: this.initAttempts,
                newSystemLoaded: typeof window.LMSUnifiedReactionSystem !== 'undefined',
                newSystemActive: !!(window.LMSUnifiedReactionSystem && !window.LMSUnifiedReactionSystem._disabled),
                legacySystemAvailable: typeof window.toggleReaction === 'function'
            };
        }

        /**
         * 監視停止
         */
        stopMonitoring() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
        }
    }

    // グローバルに登録
    window.LMSSafeIntegrationLoader = new LMSSafeIntegrationLoader();

    // DOM準備完了後に統合開始
    $(document).ready(function() {
        window.LMSSafeIntegrationLoader.startIntegration();
    });

    // デバッグ用コマンド
    window.checkIntegrationStatus = function() {
        if (window.LMSSafeIntegrationLoader) {
            const status = window.LMSSafeIntegrationLoader.getIntegrationStatus();
            return status;
        }
        return null;
    };

    // 統合モード切り替えコマンド
    window.switchReactionMode = function(mode) {
        if (['unified', 'legacy'].includes(mode)) {
            localStorage.setItem('lms_reaction_mode', mode);
        } else {
        }
    };


})(jQuery);