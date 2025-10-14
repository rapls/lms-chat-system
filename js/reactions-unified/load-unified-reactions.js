/**
 * 統合リアクションシステムローダー
 * 
 * HTMLから安全に統合リアクションシステムを読み込むための
 * 単一ファイルローダー
 * 
 * @version 1.0.0
 * @since 2025-09-13
 */

(function() {
    'use strict';

    // 重複読み込み防止
    if (typeof window.UnifiedReactionsLoaded !== 'undefined') {
        return;
    }


    // 読み込み状態管理
    window.UnifiedReactionsLoaded = {
        timestamp: Date.now(),
        status: 'loading'
    };

    /**
     * スクリプト動的読み込み関数
     */
    function loadScript(src, callback) {
        // 既に読み込まれているかチェック
        if (document.querySelector(`script[src*="${src}"]`)) {
            callback(null);
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            callback(null);
        };
        script.onerror = (error) => {
            callback(error);
        };
        
        document.head.appendChild(script);
    }

    /**
     * 統合リアクションシステム読み込み
     */
    function loadUnifiedReactionSystem() {
        const baseUrl = '/wp-content/themes/lms/js/reactions-unified/';
        
        // 読み込むファイルの順序（依存関係順）
        const scripts = [
            baseUrl + 'lms-safe-integration-loader.js',
            // メインシステムは safe-integration-loader が動的に読み込む
        ];

        let loadedCount = 0;
        const totalCount = scripts.length;

        // 順次読み込み
        function loadNext(index) {
            if (index >= scripts.length) {
                window.UnifiedReactionsLoaded.status = 'loaded';
                
                // 読み込み完了イベント
                if (typeof window.jQuery !== 'undefined') {
                    jQuery(document).trigger('unified-reactions:loaded');
                }
                
                return;
            }

            loadScript(scripts[index], (error) => {
                if (error) {
                    window.UnifiedReactionsLoaded.status = 'error';
                    window.UnifiedReactionsLoaded.error = error;
                    return;
                }

                loadedCount++;
                
                // 次のファイル読み込み
                loadNext(index + 1);
            });
        }

        // 読み込み開始
        loadNext(0);
    }

    /**
     * 安全性チェック
     */
    function performSafetyCheck() {

        // jQuery存在チェック
        if (typeof window.jQuery === 'undefined') {
            return false;
        }

        // 基本的なDOM操作が可能かチェック
        try {
            const testElement = document.createElement('div');
            document.body.appendChild(testElement);
            document.body.removeChild(testElement);
        } catch (error) {
            return false;
        }

        // 必要なJavaScript機能チェック
        if (!window.Promise || !window.Map || !window.Set) {
            return false;
        }

        return true;
    }

    /**
     * 初期化
     */
    function init() {

        // 安全性チェック
        if (!performSafetyCheck()) {
            window.UnifiedReactionsLoaded.status = 'safety_check_failed';
            return;
        }

        // 既存システムの状態確認
        const existingSystemStatus = {
            toggleReaction: typeof window.toggleReaction === 'function',
            lmsChat: typeof window.lmsChat !== 'undefined',
            timestamp: Date.now()
        };

        window.UnifiedReactionsLoaded.existingSystem = existingSystemStatus;

        // 統合システム読み込み開始
        loadUnifiedReactionSystem();
    }

    // DOMContentLoaded または 即座実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM既に準備完了の場合は即座に実行
        setTimeout(init, 0);
    }

    // 緊急停止機能
    window.emergencyStopUnifiedReactions = function() {
        window.UnifiedReactionsLoaded.status = 'emergency_stopped';
        
        // 統合システム停止
        if (window.LMSUnifiedReactionSystem && typeof window.LMSUnifiedReactionSystem.shutdown === 'function') {
            window.LMSUnifiedReactionSystem.shutdown();
        }
        
        // ローダー停止
        if (window.LMSSafeIntegrationLoader && typeof window.LMSSafeIntegrationLoader.stopMonitoring === 'function') {
            window.LMSSafeIntegrationLoader.stopMonitoring();
        }
        
    };

    // 状態確認機能
    window.checkUnifiedReactionsStatus = function() {
        
        if (window.LMSUnifiedReactionSystem) {
        }
        
        if (window.LMSSafeIntegrationLoader) {
        }
        
        return window.UnifiedReactionsLoaded;
    };


})();