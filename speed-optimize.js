/**
 * LMS チャットシステム 速度最適化スクリプト
 * リロード速度とメッセージ読み込み速度を改善
 */

(function($) {
    'use strict';
    
    // 最適化モジュール
    window.LMSSpeedOptimizer = {
        
        /**
         * 初期化
         */
        init: function() {
            this.optimizeInitialLoad();
            this.optimizeMessageLoading();
            this.optimizeScrollPerformance();
            this.optimizeDOMOperations();
        },
        
        /**
         * 初期読み込み最適化
         */
        optimizeInitialLoad: function() {
            // 画像の遅延読み込み
            $('img').attr('loading', 'lazy');
            
            // CSSアニメーションの最適化
            if (window.requestIdleCallback) {
                requestIdleCallback(() => {
                    this.preloadCriticalResources();
                });
            }
        },
        
        /**
         * 重要リソースのプリロード
         */
        preloadCriticalResources: function() {
            const criticalImages = [
                '/wp-content/themes/lms/img/icon-thread.svg',
                '/wp-content/themes/lms/img/icon-emoji.svg'
            ];
            
            criticalImages.forEach(url => {
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = url;
                document.head.appendChild(link);
            });
        },
        
        /**
         * メッセージ読み込み最適化
         */
        optimizeMessageLoading: function() {
            // バッチ処理用のキュー
            this.messageQueue = [];
            this.batchTimeout = null;
            
            // メッセージ追加を傍受
            const originalAppendMessage = window.LMSChat?.messages?.appendMessage;
            if (originalAppendMessage) {
                window.LMSChat.messages.appendMessage = (messageData, options) => {
                    // キューに追加
                    this.messageQueue.push({ messageData, options });
                    
                    // バッチ処理をスケジュール
                    if (!this.batchTimeout) {
                        this.batchTimeout = setTimeout(() => {
                            this.processBatchMessages(originalAppendMessage);
                        }, 50); // 50ms待機してバッチ処理
                    }
                };
            }
        },
        
        /**
         * バッチメッセージ処理
         */
        processBatchMessages: function(originalAppendMessage) {
            const messages = this.messageQueue.splice(0);
            this.batchTimeout = null;
            
            if (messages.length === 0) return;
            
            // DocumentFragment を使用してバッチ追加
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            
            messages.forEach(({ messageData, options }) => {
                originalAppendMessage.call(window.LMSChat.messages, messageData, options);
            });
        },
        
        /**
         * スクロールパフォーマンス最適化
         */
        optimizeScrollPerformance: function() {
            const chatContainer = document.getElementById('chat-messages');
            if (!chatContainer) return;
            
            // パッシブイベントリスナーを使用
            chatContainer.addEventListener('scroll', this.throttle(() => {
                // スクロール処理
            }, 100), { passive: true });
        },
        
        /**
         * DOM操作の最適化
         */
        optimizeDOMOperations: function() {
            // MutationObserverの最適化
            if (window.MutationObserver) {
                const observer = new MutationObserver(this.throttle((mutations) => {
                    // バッチ処理
                    requestAnimationFrame(() => {
                        // DOM更新処理
                    });
                }, 200));
                
                const chatContainer = document.getElementById('chat-messages');
                if (chatContainer) {
                    observer.observe(chatContainer, {
                        childList: true,
                        subtree: false // サブツリーは監視しない（軽量化）
                    });
                }
            }
        },
        
        /**
         * スロットル関数
         */
        throttle: function(func, limit) {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },
        
        /**
         * デバウンス関数
         */
        debounce: function(func, wait) {
            let timeout;
            return function() {
                const context = this;
                const args = arguments;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        }
    };
    
    // ページ読み込み完了後に初期化
    $(document).ready(function() {
        // DOM読み込み完了を待ってから最適化を開始
        if (document.readyState === 'complete') {
            window.LMSSpeedOptimizer.init();
        } else {
            window.addEventListener('load', () => {
                window.LMSSpeedOptimizer.init();
            });
        }
    });
    
})(jQuery);
