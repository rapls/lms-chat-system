/**
 * LMS Chat 遅延読み込みシステム
 * 初期表示速度を大幅に向上させる軽量ローダー
 */
(function() {
    'use strict';

    window.LMSChatLazyLoader = {
        initialized: false,
        loadQueue: [],
        
        // 🚀 軽量初期化（即座に実行される最小限の処理）
        initLightweight: function() {
            if (this.initialized) return;
            this.initialized = true;
            
            // 基本的なイベントハンドラーのみ設定
            this.setupBasicEvents();
            
            // 必要な要素の遅延初期化
            setTimeout(() => this.initializeComponents(), 100);
            
            // リアクション機能の遅延読み込み
            setTimeout(() => this.loadReactionSystem(), 2000);
            
            // 検索機能の遅延読み込み
            setTimeout(() => this.loadSearchSystem(), 3000);
        },
        
        // 基本イベントハンドラー設定
        setupBasicEvents: function() {
            // チャンネル切り替えの基本的な処理のみ
            document.addEventListener('click', (e) => {
                const channelItem = e.target.closest('.channel-item');
                if (channelItem) {
                    this.handleChannelSwitch(channelItem);
                }
            });
            
            // メニューの基本処理
            const menuButton = document.getElementById('chatMenuButton');
            const menuContent = document.getElementById('chatMenuContent');
            if (menuButton && menuContent) {
                menuButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    menuContent.classList.toggle('show');
                });
            }
        },
        
        // チャンネル切り替えの軽量処理
        handleChannelSwitch: function(channelItem) {
            const channelId = channelItem.getAttribute('data-channel-id');
            const channelType = channelItem.getAttribute('data-channel-type');
            
            // アイコン変更の基本処理
            const iconContainer = document.querySelector('.channel-header-icon');
            const hashIcon = document.querySelector('.channel-header-icon .icon-hash');
            const lockIcon = document.querySelector('.channel-header-icon .icon-lock');
            
            if (channelType === 'public') {
                if (iconContainer) iconContainer.style.display = 'flex';
                if (hashIcon) hashIcon.style.display = 'block';
                if (lockIcon) lockIcon.style.display = 'none';
            } else if (channelType === 'private') {
                if (iconContainer) iconContainer.style.display = 'flex';
                if (hashIcon) hashIcon.style.display = 'none';
                if (lockIcon) lockIcon.style.display = 'block';
            }
            
            // 実際のチャンネル読み込みは別途実行
            if (window.LMSChat && window.LMSChat.ui && window.LMSChat.ui.switchChannel) {
                window.LMSChat.ui.switchChannel(channelId);
            }
        },
        
        // コンポーネントの初期化
        initializeComponents: function() {
            // プッシュ通知の遅延初期化
            if (window.lmsPushConfig) {
                window.lmsPush = Object.freeze(window.lmsPushConfig);
            }
            
            // Service Worker イベントの設定
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data.type === 'NOTIFICATION_CLICK') {
                        this.handleNotificationClick(event.data);
                    }
                });
            }
            
            // 通知ボタンの設定
            this.setupNotificationButton();
        },
        
        // 通知クリック処理
        handleNotificationClick: function(data) {
            if (data.channelId && typeof switchChannel === 'function') {
                switchChannel(parseInt(data.channelId));
                
                if (data.messageId) {
                    setTimeout(() => {
                        const message = document.querySelector(`.chat-message[data-message-id="${data.messageId}"]`);
                        if (message) {
                            const container = document.querySelector('.chat-messages');
                            if (container) {
                                container.scrollTop = message.offsetTop - container.offsetTop;
                                message.classList.add('highlight-message');
                                setTimeout(() => message.classList.remove('highlight-message'), 3000);
                            }
                        }
                    }, 500);
                }
            }
        },
        
        // 通知ボタンの設定
        setupNotificationButton: function() {
            const enableNotificationsButton = document.getElementById('enableNotificationsButton');
            if (!enableNotificationsButton) return;
            
            const updateButtonStyle = () => {
                if (Notification.permission === 'granted') {
                    enableNotificationsButton.classList.add('enabled');
                    const span = enableNotificationsButton.querySelector('span');
                    if (span) span.textContent = 'プッシュ通知は有効です';
                } else {
                    enableNotificationsButton.classList.remove('enabled');
                    const span = enableNotificationsButton.querySelector('span');
                    if (span) span.textContent = 'プッシュ通知を有効にする';
                }
            };
            
            updateButtonStyle();
            
            enableNotificationsButton.addEventListener('click', async (e) => {
                e.preventDefault();
                if (window.pushNotification && typeof window.pushNotification.setupPushSubscription === 'function') {
                    await window.pushNotification.setupPushSubscription();
                    updateButtonStyle();
                    const menuContent = document.getElementById('chatMenuContent');
                    if (menuContent) menuContent.classList.remove('show');
                }
            });
            
            if ('Notification' in window) {
                setInterval(updateButtonStyle, 2000);
            }
        },
        
        // リアクションシステムの遅延読み込み
        loadReactionSystem: function() {
            if (window.LMSChat && window.LMSChat.reactions) return; // 既に読み込み済み
            
            // リアクション関連のCSS追加
            this.addReactionStyles();
            
            // リアクション機能の基本初期化
            setTimeout(() => {
                if (window.LMSChat && window.LMSChat.reactions && window.LMSChat.reactions.init) {
                    window.LMSChat.reactions.init();
                }
            }, 500);
        },
        
        // 検索システムの遅延読み込み
        loadSearchSystem: function() {
            // 検索ボタンの可視性確保
            this.ensureSearchButtonVisible();
            
            // 検索関連のイベント設定
            const searchInput = document.getElementById('chat-search-input');
            const searchButton = document.getElementById('chat-search-button');
            
            if (searchInput) {
                searchInput.addEventListener('focus', () => this.ensureSearchButtonVisible());
                searchInput.addEventListener('click', () => this.ensureSearchButtonVisible());
            }
            
            if (searchButton) {
                this.addSearchButtonStyles();
            }
        },
        
        // 検索ボタンの可視性確保
        ensureSearchButtonVisible: function() {
            const searchBtn = document.getElementById('chat-search-button');
            if (!searchBtn) return;
            
            searchBtn.style.setProperty('display', 'flex', 'important');
            searchBtn.style.setProperty('visibility', 'visible', 'important');
            searchBtn.style.setProperty('opacity', '1', 'important');
            searchBtn.style.setProperty('position', 'absolute', 'important');
            searchBtn.style.setProperty('left', '10px', 'important');
            searchBtn.style.setProperty('top', '50%', 'important');
            searchBtn.style.setProperty('transform', 'translateY(-50%)', 'important');
            searchBtn.style.setProperty('z-index', '9999', 'important');
            searchBtn.style.setProperty('width', '20px', 'important');
            searchBtn.style.setProperty('height', '20px', 'important');
        },
        
        // リアクション用スタイル追加
        addReactionStyles: function() {
            if (document.getElementById('reaction-styles')) return; // 既に追加済み
            
            const style = document.createElement('style');
            style.id = 'reaction-styles';
            style.textContent = `
                .reaction-item {
                    display: inline-block !important;
                    margin: 2px !important;
                    padding: 4px 8px !important;
                    background: #f5f5f5 !important;
                    border-radius: 12px !important;
                    cursor: pointer !important;
                    border: 1px solid #ddd !important;
                    user-select: none !important;
                    transition: background-color 0.2s ease !important;
                }
                .reaction-item.user-reacted {
                    background: #e3f2fd !important;
                    border-color: #2196f3 !important;
                }
                .reaction-item:hover {
                    background: #e8e8e8 !important;
                }
            `;
            document.head.appendChild(style);
        },
        
        // 検索ボタン用スタイル追加
        addSearchButtonStyles: function() {
            if (document.getElementById('search-button-styles')) return; // 既に追加済み
            
            const style = document.createElement('style');
            style.id = 'search-button-styles';
            style.textContent = `
                .chat-search-button, #chat-search-button {
                    position: absolute !important;
                    left: 10px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                    background: none !important;
                    border: none !important;
                    padding: 0 !important;
                    cursor: pointer !important;
                    color: #666 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    height: 20px !important;
                    width: 20px !important;
                    z-index: 10 !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                }
                .chat-search-button:hover, #chat-search-button:hover {
                    color: #333 !important;
                }
                .chat-search-input, #chat-search-input {
                    padding-left: 35px !important;
                }
            `;
            document.head.appendChild(style);
        }
    };

    // DOMContentLoaded時または即座に軽量初期化を実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // 緊急パフォーマンス最適化: 5秒遅延
            setTimeout(() => {
                window.LMSChatLazyLoader.initLightweight();
            }, 5000);
        });
    } else {
        window.LMSChatLazyLoader.initLightweight();
    }

    // LMSChatLoader との統合
    if (window.LMSChatLoader) {
        window.LMSChatLoader.initLightweight = () => window.LMSChatLazyLoader.initLightweight();
    }
})();