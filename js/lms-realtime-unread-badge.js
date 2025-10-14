/**
 * LMS リアルタイム未読バッジ管理システム
 * データベースの未読フラグをリアルタイムに反映する完全新規システム
 */

(function($) {
    'use strict';
    window.LMSRealtimeUnreadBadge = {
        initialized: false,
        
        currentUserId: null,
        currentChannelId: null,
        
        unreadCounts: {
            channels: {},
            threads: {},
            total: 0,
            totalWithMuted: 0
        },
        
        mutedChannels: new Set(),
        
        config: {
            ajaxUrl: window.lmsRealtimeBadgeConfig?.ajaxUrl || window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
            nonce: window.lmsRealtimeBadgeConfig?.nonce || window.lmsChat?.nonce || '',
            currentUserId: window.lmsRealtimeBadgeConfig?.currentUserId || null,
            updateInterval: 30000,
            enablePeriodicSync: false
        },
        /**
         * システム初期化
         */
        init: function() {
            if (this.initialized) {
                return;
            }
            
            this.currentUserId = this.getCurrentUserId();
            if (!this.currentUserId) {
                return;
            }
            
            this.currentChannelId = this.getCurrentChannelId();
            
            this.loadMuteStatus();
            
            this.loadInitialUnreadCounts().then(() => {
                this.setupRealtimeListeners();
                
                if (this.config.enablePeriodicSync) {
                    this.startPeriodicSync();
                }
                
                this.initialized = true;
                
                this.updateAllBadges();
            }).catch(error => {
            });
        },
        /**
         * 現在のユーザーIDを取得
         */
        getCurrentUserId: function() {
            if (this.config.currentUserId && this.config.currentUserId > 0) {
                return parseInt(this.config.currentUserId);
            }
            
            return window.lmsChat?.currentUserId ||
                   window.LMSChat?.state?.currentUserId ||
                   window.lmsCurrentUserId ||
                   parseInt($('meta[name="lms-user-id"]').attr('content')) ||
                   null;
        },
        
        /**
         * 現在のチャンネルIDを取得
         */
        getCurrentChannelId: function() {
            const urlParams = new URLSearchParams(window.location.search);
            const channelFromUrl = urlParams.get('channel');
            
            return parseInt(channelFromUrl) ||
                   window.LMSChat?.state?.currentChannel ||
                   window.lmsChat?.currentChannelId ||
                   null;
        },
        /**
         * ミュートされたチャンネル一覧を読み込み
         */
        loadMutedChannels: function() {
            return new Promise((resolve, reject) => {
                resolve();
            });
        },
        
        /**
         * チャンネルがミュートされているかチェック
         */
        isChannelMuted: function(channelId) {
            if (this.mutedChannels.has(parseInt(channelId))) {
                return true;
            }
            
            const $channelItem = $(`.channel-item[data-channel-id="${channelId}"]`);
            if ($channelItem.length > 0 && $channelItem.hasClass('muted')) {
                this.mutedChannels.add(parseInt(channelId));
                return true;
            }
            
            if (window.LMSChat && window.LMSChat.mutedChannels) {
                return window.LMSChat.mutedChannels.includes(parseInt(channelId));
            }
            
            return false;
        },
        
        /**
         * ミュート状態をサーバーから読み込み
         */
        loadMuteStatus: function() {
            
            $('.channel-item.muted').each((index, element) => {
                const channelId = parseInt($(element).data('channel-id'));
                if (channelId) {
                    this.mutedChannels.add(channelId);
                }
            });
        },
        /**
         * 未読カウントを取得（エイリアス）
         */
        fetchUnreadCounts: function() {
            return this.loadInitialUnreadCounts();
        },
        
        /**
         * 初期未読カウントをデータベースから読み込み
         */
        loadInitialUnreadCounts: function() {
            return new Promise((resolve, reject) => {
                
                const requestData = {
                    action: 'lms_get_realtime_unread_counts',
                    user_id: this.currentUserId,
                    nonce: this.config.nonce
                };
                
                $.ajax({
                    url: this.config.ajaxUrl,
                    type: 'POST',
                    data: requestData,
                    success: (response) => {
                        if (response.success) {
                            this.processUnreadData(response.data);
                            resolve(response.data);
                        } else {
                            reject(new Error(response.data || 'Unknown error'));
                        }
                    },
                    error: (xhr, status, error) => {
                        reject(error);
                    }
                });
            });
        },
        
        /**
         * サーバーから取得した未読データを処理
         */
        processUnreadData: function(data) {
            if (data.channels) {
                this.unreadCounts.channels = {};
                Object.keys(data.channels).forEach(channelId => {
                    this.unreadCounts.channels[channelId] = parseInt(data.channels[channelId]) || 0;
                });
            }
            
            if (data.threads) {
                this.unreadCounts.threads = {};
                Object.keys(data.threads).forEach(parentMessageId => {
                    this.unreadCounts.threads[parentMessageId] = parseInt(data.threads[parentMessageId]) || 0;
                });
            }
            
            this.recalculateTotalUnread();
        },
        
        /**
         * 総未読数を再計算
         */
        recalculateTotalUnread: function() {
            let total = 0;
            let totalWithMuted = 0;
            
            Object.keys(this.unreadCounts.channels).forEach(channelId => {
                const count = this.unreadCounts.channels[channelId] || 0;
                totalWithMuted += count;
                
                if (!this.isChannelMuted(channelId)) {
                    total += count;
                }
            });
            
            this.unreadCounts.total = total;
            this.unreadCounts.totalWithMuted = totalWithMuted;
            
        },
        /**
         * リアルタイムイベントリスナーを設定
         */
        setupRealtimeListeners: function() {
            
            if (window.LMSChat?.LongPoll) {
                window.LMSChat.LongPoll.addEventListener('main_message_posted', (data) => {
                    this.handleNewMessage(data);
                });
                
                window.LMSChat.LongPoll.addEventListener('thread_message_posted', (data) => {
                    this.handleNewThreadMessage(data);
                });
            }
            
            $(document).on('lms-new-message', (event, data) => {
                this.handleNewMessage(data);
            });
            
            $(document).on('lms-new-thread-message', (event, data) => {
                this.handleNewThreadMessage(data);
            });
            
            $(document).on('lms-message-read', (event, data) => {
                this.handleMessageRead(data);
            });
            
            $(document).on('lms-channel-switched', (event, channelId) => {
                this.handleChannelSwitch(channelId);
            });
        },
        
        /**
         * 新規メインメッセージ処理
         */
        handleNewMessage: function(data) {
            if (!data) return;
            
            if (!data.payload && data.channel_id) {
                data = {
                    messageId: data.id,
                    payload: {
                        channel_id: data.channel_id,
                        user_id: data.user_id,
                        message: data.message || data.content
                    }
                };
            }
            
            if (!data.payload) {
                return;
            }
            
            const messageId = data.messageId || data.id;
            const channelId = parseInt(data.payload.channel_id);
            const senderId = parseInt(data.payload.user_id);
            
            if (senderId === this.currentUserId) {
                return;
            }
            this.unreadCounts.channels[channelId] = (this.unreadCounts.channels[channelId] || 0) + 1;
            
            this.recalculateTotalUnread();
            
            this.updateChannelBadge(channelId);
            this.updateHeaderBadge();
            
            this.markMessageAsUnreadOnServer(messageId, channelId, 'main');
        },
        
        /**
         * 新規スレッドメッセージ処理
         */
        handleNewThreadMessage: function(data) {
            if (!data.payload) return;
            
            const messageId = data.messageId;
            const channelId = parseInt(data.payload.channel_id);
            const parentMessageId = parseInt(data.payload.parent_message_id);
            const senderId = parseInt(data.payload.user_id);
            
            if (senderId === this.currentUserId) {
                return;
            }
            this.unreadCounts.threads[parentMessageId] = (this.unreadCounts.threads[parentMessageId] || 0) + 1;
            
            this.unreadCounts.channels[channelId] = (this.unreadCounts.channels[channelId] || 0) + 1;
            
            this.recalculateTotalUnread();
            
            this.updateThreadBadge(parentMessageId);
            this.updateChannelBadge(channelId);
            this.updateHeaderBadge();
            
            this.markMessageAsUnreadOnServer(messageId, channelId, 'thread', parentMessageId);
        },
        
        /**
         * メッセージ既読処理
         */
        handleMessageRead: function(data) {
            const messageId = data.messageId;
            const channelId = parseInt(data.channelId);
            const messageType = data.messageType || 'main';
            if (messageType === 'main') {
                if (this.unreadCounts.channels[channelId] > 0) {
                    this.unreadCounts.channels[channelId]--;
                }
            } else if (messageType === 'thread' && data.parentMessageId) {
                const parentMessageId = parseInt(data.parentMessageId);
                
                if (this.unreadCounts.threads[parentMessageId] > 0) {
                    this.unreadCounts.threads[parentMessageId]--;
                }
                
                if (this.unreadCounts.channels[channelId] > 0) {
                    this.unreadCounts.channels[channelId]--;
                }
            }
            
            this.recalculateTotalUnread();
            
            this.updateChannelBadge(channelId);
            if (data.parentMessageId) {
                this.updateThreadBadge(data.parentMessageId);
            }
            this.updateHeaderBadge();
            
            this.removeUnreadFromServer(messageId);
        },
        
        /**
         * チャンネル切り替え処理
         */
        handleChannelSwitch: function(channelId) {
            
            const oldChannelId = this.currentChannelId;
            this.currentChannelId = parseInt(channelId);
            
            if (this.unreadCounts.channels[channelId] > 0) {
                this.unreadCounts.channels[channelId] = 0;
                
                this.recalculateTotalUnread();
                
                this.updateChannelBadge(channelId);
                this.updateHeaderBadge();
                
                this.markChannelAsReadOnServer(channelId);
            }
        },
        /**
         * メッセージを未読としてサーバーにマーク
         */
        markMessageAsUnreadOnServer: function(messageId, channelId, messageType = 'main', parentMessageId = null) {
            $.ajax({
                url: this.config.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'lms_mark_message_as_unread_realtime',
                    message_id: messageId,
                    channel_id: channelId,
                    message_type: messageType,
                    parent_message_id: parentMessageId,
                    nonce: this.config.nonce
                },
                success: (response) => {
                    if (response.success) {
                    } else {
                    }
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * サーバーから未読状態を削除
         */
        removeUnreadFromServer: function(messageId) {
            $.ajax({
                url: this.config.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'lms_remove_unread_message',
                    message_id: messageId,
                    nonce: this.config.nonce
                },
                success: (response) => {
                    if (response.success) {
                    } else {
                    }
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * チャンネルを既読としてサーバーにマーク
         */
        markChannelAsReadOnServer: function(channelId) {
            $.ajax({
                url: this.config.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'lms_mark_channel_as_read_realtime',
                    channel_id: channelId,
                    nonce: this.config.nonce
                },
                success: (response) => {
                    if (response.success) {
                    } else {
                    }
                },
                error: (xhr, status, error) => {
                }
            });
        },
        /**
         * 全バッジを更新
         */
        updateAllBadges: function() {
            this.updateHeaderBadge();
            Object.keys(this.unreadCounts.channels).forEach(channelId => {
                this.updateChannelBadge(channelId);
            });
            Object.keys(this.unreadCounts.threads).forEach(parentMessageId => {
                this.updateThreadBadge(parentMessageId);
            });
        },
        
        /**
         * ヘッダーバッジを更新
         */
        updateHeaderBadge: function() {
            const totalUnread = this.unreadCounts.total;
            const selectors = [
                '.header-container .chat-icon .unread-badge',
                '.header .chat-icon .unread-badge',
                '.chat-icon-wrapper .chat-icon .unread-badge',
                '.chat-icon-wrapper .unread-badge',
                '.chat-icon .unread-badge',
                '.lms-realtime-header-badge'
            ];
            
            let $badge = null;
            for (const selector of selectors) {
                $badge = $(selector).first();
                if ($badge.length > 0) {
                    break;
                }
            }
            
            if (!$badge || $badge.length === 0) {
                $badge = this.createHeaderBadge();
            }
            
            if ($badge && $badge.length > 0) {
                if (totalUnread > 0) {
                    $badge.text(totalUnread).show().removeClass('hidden');
                } else {
                    $badge.hide().addClass('hidden');
                }
            }
        },
        
        /**
         * ヘッダーバッジを作成
         */
        createHeaderBadge: function() {
            
            const iconSelectors = [
                '.header-container .chat-icon',
                '.header .chat-icon',
                '.chat-icon-wrapper .chat-icon',
                '.chat-icon'
            ];
            
            let $chatIcon = null;
            for (const selector of iconSelectors) {
                $chatIcon = $(selector).first();
                if ($chatIcon.length > 0) {
                    break;
                }
            }
            
            if ($chatIcon && $chatIcon.length > 0) {
                const $badge = $('<span class="unread-badge lms-realtime-header-badge"></span>');
                $chatIcon.append($badge);
                
                if ($chatIcon.css('position') === 'static') {
                    $chatIcon.css('position', 'relative');
                }
                
                return $badge;
            }
            
            return null;
        },
        
        /**
         * チャンネルバッジを更新
         */
        updateChannelBadge: function(channelId) {
            const count = this.unreadCounts.channels[channelId] || 0;
            const isMuted = this.isChannelMuted(channelId);
            const $channelItem = $(`.channel-item[data-channel-id="${channelId}"]`);
            if ($channelItem.length === 0) return;
            
            let $badge = $channelItem.find('.unread-badge').first();
            if ($badge.length === 0) {
                $badge = $('<span class="unread-badge lms-realtime-channel-badge"></span>');
                $channelItem.append($badge);
            }
            
            if (isMuted) {
                $badge.hide().addClass('hidden');
                return;
            }
            
            if (count > 0) {
                $badge.text(count).show().removeClass('hidden');
            } else {
                $badge.hide().addClass('hidden');
            }
        },
        
        /**
         * スレッドバッジを更新
         */
        updateThreadBadge: function(parentMessageId) {
            const count = this.unreadCounts.threads[parentMessageId] || 0;
            const $threadItem = $(`.thread-item[data-parent-message-id="${parentMessageId}"], .message-item[data-message-id="${parentMessageId}"]`);
            if ($threadItem.length === 0) return;
            
            let $badge = $threadItem.find('.thread-unread-badge').first();
            if ($badge.length === 0) {
                $badge = $('<span class="thread-unread-badge lms-realtime-thread-badge"></span>');
                $threadItem.find('.thread-info, .message-actions').first().append($badge);
            }
            
            if (count > 0) {
                $badge.text(count).show().removeClass('hidden');
            } else {
                $badge.hide().addClass('hidden');
            }
        },
        /**
         * 定期同期を開始
         */
        startPeriodicSync: function() {
            if (!this.config.enablePeriodicSync) return;
            setInterval(() => {
                this.syncWithServer();
            }, this.config.updateInterval);
        },
        
        /**
         * サーバーと同期
         */
        syncWithServer: function() {
            
            this.loadInitialUnreadCounts().then(() => {
                this.updateAllBadges();
            }).catch(error => {
            });
        },
        /**
         * 現在の状態をデバッグ出力
         */
        debugStatus: function() {
            
            return {
                initialized: this.initialized,
                currentUserId: this.currentUserId,
                currentChannelId: this.currentChannelId,
                unreadCounts: this.unreadCounts,
                mutedChannels: Array.from(this.mutedChannels),
                config: this.config
            };
        },
        
        /**
         * 手動で同期実行
         */
        manualSync: function() {
            return this.syncWithServer();
        },
        
        /**
         * 全バッジを強制リセット
         */
        resetAllBadges: function() {
            
            this.unreadCounts = {
                channels: {},
                threads: {},
                total: 0,
                totalWithMuted: 0
            };
            
            this.updateAllBadges();
        }
    };
    
    window.syncRealtimeUnreadBadge = function() {
        return window.LMSRealtimeUnreadBadge.manualSync();
    };
    
    window.resetRealtimeUnreadBadges = function() {
        return window.LMSRealtimeUnreadBadge.resetAllBadges();
    };
    
})(jQuery);