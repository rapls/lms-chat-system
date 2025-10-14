/**
 * LMS チャット軽量ローダー - 高速起動対応版
 *
 * 必要最小限のモジュールのみを即座に読み込み、
 * その他は遅延読み込みで高速化を実現
 */

(function() {
    'use strict';

    // 軽量化されたグローバル名前空間
    window.LMSChatMinimal = {
        // 基本状態管理（最小限）
        state: {
            currentChannel: null,
            currentThread: null,
            isLoading: false,
            userId: null,
            username: null
        },

        // 読み込み状態管理
        loader: {
            coreLoaded: false,
            additionalModules: {},
            loadQueue: []
        },

        // 基本ユーティリティ（最小限）
        utils: {
            escapeHtml: function(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },

            formatTime: function(dateString) {
                const date = new Date(dateString);
                const now = new Date();
                const diff = now - date;
                
                if (diff < 60000) return 'たった今';
                if (diff < 3600000) return Math.floor(diff / 60000) + '分前';
                if (diff < 86400000) return Math.floor(diff / 3600000) + '時間前';
                
                return date.toLocaleDateString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            },

            debounce: function(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            }
        },

        // 軽量Ajax処理
        ajax: {
            request: function(action, data, callback, errorCallback) {
                const xhr = new XMLHttpRequest();
                const formData = new FormData();
                
                formData.append('action', action);
                formData.append('nonce', window.lmsAjax?.nonce || '');
                
                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        formData.append(key, data[key]);
                    }
                }

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            try {
                                const response = JSON.parse(xhr.responseText);
                                if (response.success) {
                                    if (callback) callback(response.data);
                                } else {
                                    if (errorCallback) errorCallback(response.data?.message || 'エラーが発生しました');
                                }
                            } catch (e) {
                                if (errorCallback) errorCallback('レスポンスの解析に失敗しました');
                            }
                        } else {
                            if (errorCallback) errorCallback('通信エラーが発生しました');
                        }
                    }
                };

                xhr.open('POST', window.lmsAjax?.ajaxurl || '/wp-admin/admin-ajax.php');
                xhr.send(formData);
            }
        },

        // 基本メッセージ機能（最小限）
        messages: {
            container: null,
            
            init: function() {
                this.container = document.getElementById('chat-messages');
                if (!this.container) {
                    return false;
                }
                return true;
            },

            append: function(messageData) {
                if (!this.container) return;

                const messageEl = document.createElement('div');
                messageEl.className = 'chat-message';
                messageEl.setAttribute('data-message-id', messageData.id);
                messageEl.innerHTML = `
                    <div class="message-header">
                        <span class="message-user">${this.escapeHtml(messageData.username || messageData.user_name)}</span>
                        <span class="message-time">${window.LMSChatMinimal.utils.formatTime(messageData.created_at)}</span>
                    </div>
                    <div class="message-content">${this.escapeHtml(messageData.content)}</div>
                `;

                this.container.appendChild(messageEl);
                this.scrollToBottom();
            },

            scrollToBottom: function() {
                if (this.container) {
                    this.container.scrollTop = this.container.scrollHeight;
                }
            },

            escapeHtml: function(text) {
                return window.LMSChatMinimal.utils.escapeHtml(text);
            }
        },

        // 軽量UI管理
        ui: {
            showLoading: function(message = '読み込み中...') {
                const loader = document.getElementById('chat-loader');
                if (loader) {
                    loader.style.display = 'block';
                    const text = loader.querySelector('.loader-text');
                    if (text) text.textContent = message;
                }
            },

            hideLoading: function() {
                const loader = document.getElementById('chat-loader');
                if (loader) {
                    loader.style.display = 'none';
                }
            },

            updateBadge: function(count) {
                const badge = document.querySelector('.unread-badge');
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : count;
                        badge.style.display = 'inline-block';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            }
        },

        // モジュール遅延読み込み
        loadModule: function(moduleName, callback) {
            if (this.loader.additionalModules[moduleName]) {
                if (callback) callback();
                return;
            }

            const moduleMap = {
                'longpoll': '/js/lms-unified-longpoll.js',
                'reactions': '/js/chat-reactions-core.js',
                'search': '/js/chat-search.js',
                'threads': '/js/chat-threads.js',
                'upload': '/js/lms-chat-upload.js'
            };

            const scriptPath = moduleMap[moduleName];
            if (!scriptPath) {
                return;
            }

            const script = document.createElement('script');
            script.src = window.lmsTheme?.themeUrl + scriptPath || scriptPath;
            script.onload = () => {
                this.loader.additionalModules[moduleName] = true;
                if (callback) callback();
            };
            script.onerror = () => {
            };

            document.head.appendChild(script);
        },

        // 初期化（最小限）
        init: function() {
            // DOM準備完了まで待機
            if (document.readyState === 'loading') {
                // パフォーマンス最適化のため一時的に無効化（lms-chat-lazy-loader.jsを使用）
                // document.addEventListener('DOMContentLoaded', () => this.init());
                return;
            }

            // 基本要素の確認
            this.state.userId = window.lmsUser?.id || null;
            this.state.username = window.lmsUser?.username || null;

            if (!this.state.userId) {
                return;
            }

            // コア機能の初期化
            if (this.messages.init()) {
                this.loader.coreLoaded = true;
                
                // UIイベントの最小限設定
                this.setupMinimalEvents();
                
                // 必要に応じて追加モジュールを読み込み
                this.loadEssentialModules();
                
                // LMS Chat軽量版が初期化されました
            }
        },

        // 最小限のイベント設定
        setupMinimalEvents: function() {
            // メッセージ送信フォーム
            const form = document.getElementById('chat-form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleMessageSubmit(form);
                });
            }

            // チャンネル切り替え（基本版）
            const channelList = document.querySelectorAll('.channel-item');
            channelList.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const channelId = item.getAttribute('data-channel-id');
                    if (channelId) {
                        this.switchChannel(channelId);
                    }
                });
            });
        },

        // メッセージ送信処理（軽量版）
        handleMessageSubmit: function(form) {
            const input = form.querySelector('input[name="message"]');
            const message = input?.value?.trim();
            
            if (!message || !this.state.currentChannel) {
                return;
            }

            this.ui.showLoading('送信中...');
            
            this.ajax.request('lms_send_message', {
                channel_id: this.state.currentChannel,
                content: message
            }, (response) => {
                this.ui.hideLoading();
                if (response.message) {
                    this.messages.append(response.message);
                }
                input.value = '';
            }, (error) => {
                this.ui.hideLoading();
            });
        },

        // チャンネル切り替え（軽量版）
        switchChannel: function(channelId) {
            if (this.state.isLoading) return;
            
            this.state.isLoading = true;
            this.state.currentChannel = channelId;
            this.ui.showLoading('チャンネルを読み込み中...');
            
            this.ajax.request('lms_get_messages', {
                channel_id: channelId,
                limit: 50
            }, (response) => {
                this.state.isLoading = false;
                this.ui.hideLoading();
                
                // メッセージコンテナをクリア
                if (this.messages.container) {
                    this.messages.container.innerHTML = '';
                }
                
                // メッセージを表示
                if (response.messages && Array.isArray(response.messages)) {
                    response.messages.forEach(msg => {
                        this.messages.append(msg);
                    });
                }
                
                // チャンネル表示を更新
                this.updateChannelDisplay(channelId);
                
            }, (error) => {
                this.state.isLoading = false;
                this.ui.hideLoading();
            });
        },

        // チャンネル表示更新
        updateChannelDisplay: function(channelId) {
            // アクティブチャンネルのマーク
            document.querySelectorAll('.channel-item').forEach(item => {
                if (item.getAttribute('data-channel-id') === channelId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        },

        // 必要最小限のモジュールを読み込み
        loadEssentialModules: function() {
            // ページの状態に応じて必要なモジュールのみ読み込み
            const currentPage = window.location.pathname;
            
            if (currentPage.includes('chat')) {
                // 基本的なロングポーリングのみ
                setTimeout(() => {
                    this.loadModule('longpoll');
                }, 1000); // 1秒後に読み込み
            }
        }
    };

    // 即座に初期化開始
    window.LMSChatMinimal.init();

    // レガシー互換性のため
    window.LMSChat = window.LMSChat || window.LMSChatMinimal;

})();