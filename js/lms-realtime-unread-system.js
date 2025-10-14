/**
 * LMSリアルタイム未読バッジシステム（汎用版）
 * 新規メッセージ受信時にデータベース未読フラグを設定し、リアルタイムでバッジを更新
 */
(function($) {
    'use strict';
    
    window.LMSRealtimeUnreadSystem = {
        initialized: false,
        currentUserId: null,
        currentChannelId: null,
        
        /**
         * システム初期化
         */
        init: function() {
            if (this.initialized) return;
            
            this.currentUserId = window.lmsChat?.currentUserId || window.LMSChat?.currentUserId;
            this.currentChannelId = window.lmsChat?.state?.currentChannel || window.LMSChat?.state?.currentChannel;
            
            this.integrateLongPollEvents();
            
            this.integrateAppendMessage();
            
            this.initialized = true;
        },
        
        /**
         * Long Poll受信イベントとの統合
         */
        integrateLongPollEvents: function() {
            if (window.lmsUnifiedSync && typeof window.lmsUnifiedSync.processNewMessages === 'function') {
                const originalProcessNewMessages = window.lmsUnifiedSync.processNewMessages.bind(window.lmsUnifiedSync);
                
                window.lmsUnifiedSync.processNewMessages = async function(messages) {
                    await originalProcessNewMessages(messages);
                    
                    for (const message of messages) {
                        window.LMSRealtimeUnreadSystem.handleNewMessage(message);
                    }
                };
            }
            
            if (window.lmsUnifiedSync && typeof window.lmsUnifiedSync.processNewThreadMessages === 'function') {
                const originalProcessNewThreadMessages = window.lmsUnifiedSync.processNewThreadMessages.bind(window.lmsUnifiedSync);
                
                window.lmsUnifiedSync.processNewThreadMessages = async function(messages) {
                    await originalProcessNewThreadMessages(messages);
                    
                    for (const message of messages) {
                        window.LMSRealtimeUnreadSystem.handleNewThreadMessage(message);
                    }
                };
            }
        },
        
        /**
         * appendMessage関数との統合
         */
        integrateAppendMessage: function() {
            if (window.LMSChat?.messages && typeof window.LMSChat.messages.appendMessage === 'function') {
                const originalAppendMessage = window.LMSChat.messages.appendMessage.bind(window.LMSChat.messages);
                
                window.LMSChat.messages.appendMessage = function(message, options = {}) {
                    const result = originalAppendMessage(message, options);
                    
                    if (options.fromLongPoll && options.markAsUnread) {
                        window.LMSRealtimeUnreadSystem.handleNewMessage(message);
                    }
                    
                    return result;
                };
            }
        },
        
        /**
         * 新規メッセージの未読処理（メインチャット）
         */
        handleNewMessage: function(message) {
            if (parseInt(message.user_id) === parseInt(this.currentUserId)) {
                return;
            }
            
            this.markMessageAsUnread({
                message_id: message.id,
                channel_id: message.channel_id,
                message_type: 'main'
            });
            
            if (window.LMSUnifiedBadgeManager) {
                window.LMSUnifiedBadgeManager.onNewMessage(message);
            }
            
            this.updateChannelBadge(message.channel_id);
            
            this.updateHeaderBadge();
        },
        
        /**
         * 新規スレッドメッセージの未読処理
         */
        handleNewThreadMessage: function(message) {
            if (parseInt(message.user_id) === parseInt(this.currentUserId)) {
                return;
            }
            
            this.markMessageAsUnread({
                message_id: message.id,
                channel_id: message.channel_id,
                parent_message_id: message.parent_message_id || message.thread_id,
                message_type: 'thread'
            });
            
            this.updateThreadBadge(message.parent_message_id || message.thread_id);
            
            this.updateChannelBadge(message.channel_id);
            
            this.updateHeaderBadge();
        },
        
        /**
         * データベースに未読フラグを設定
         */
        markMessageAsUnread: function(params) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_message_as_unread_realtime',
                    message_id: params.message_id,
                    channel_id: params.channel_id,
                    parent_message_id: params.parent_message_id || null,
                    message_type: params.message_type || 'main',
                    nonce: window.lmsChat?.nonce || window.LMSChat?.nonce
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
         * チャンネルバッジをリアルタイム更新
         */
        updateChannelBadge: function(channelId) {
            if (parseInt(channelId) !== parseInt(this.currentChannelId)) {
                this.getUnreadCountForChannel(channelId, (count) => {
                    const $channelBadge = $(`.channel-item[data-channel-id="${channelId}"] .unread-badge`);
                    
                    if (count > 0) {
                        if ($channelBadge.length === 0) {
                            $(`.channel-item[data-channel-id="${channelId}"]`).append(
                                `<span class="unread-badge channel-unread-badge">${count}</span>`
                            );
                        } else {
                            $channelBadge.text(count).show();
                        }
                        
                        $(`.channel-item[data-channel-id="${channelId}"] .unread-badge`).css({
                            'display': 'inline-block',
                            'background-color': '#ff4444',
                            'color': '#ffffff',
                            'border-radius': '10px',
                            'padding': '2px 6px',
                            'font-size': '11px',
                            'font-weight': 'bold',
                            'margin-left': '5px'
                        });
                    }
                });
            }
        },
        
        /**
         * スレッドバッジをリアルタイム更新
         */
        updateThreadBadge: function(parentMessageId) {
            const isCurrentThreadOpen = $('.thread-overlay:visible').length > 0 && 
                                      $('.thread-overlay:visible').data('message-id') == parentMessageId;
            
            if (!isCurrentThreadOpen) {
                this.getUnreadCountForThread(parentMessageId, (count) => {
                    if (count > 0) {
                        const $threadInfo = $(`[data-message-id="${parentMessageId}"] .thread-info`);
                        let $threadBadge = $threadInfo.find('.thread-unread-badge');
                        
                        if ($threadBadge.length === 0) {
                            $threadInfo.append(`<span class="thread-unread-badge">${count}</span>`);
                        } else {
                            $threadBadge.text(count).show();
                        }
                        
                        $(`[data-message-id="${parentMessageId}"] .thread-unread-badge`).css({
                            'display': 'inline-block',
                            'background-color': '#ff4444',
                            'color': '#ffffff',
                            'border-radius': '10px',
                            'padding': '2px 6px',
                            'font-size': '10px',
                            'font-weight': 'bold',
                            'margin-left': '5px'
                        });
                    }
                });
            }
        },
        
        /**
         * ヘッダーバッジをリアルタイム更新
         */
        updateHeaderBadge: function() {
            this.getTotalUnreadCount((count) => {
                const $headerBadge = $('.chat-icon-wrapper .chat-icon .unread-badge');
                
                if (count > 0) {
                    if ($headerBadge.length === 0) {
                        $('.chat-icon-wrapper .chat-icon').append(
                            `<span class="unread-badge header-unread-badge">${count}</span>`
                        );
                    } else {
                        $headerBadge.text(count).show();
                    }
                    
                    $('.chat-icon-wrapper .chat-icon .unread-badge').css({
                        'display': 'inline-block',
                        'background-color': '#ff4444',
                        'color': '#ffffff',
                        'border-radius': '50%',
                        'padding': '2px 6px',
                        'font-size': '11px',
                        'font-weight': 'bold',
                        'position': 'absolute',
                        'top': '-8px',
                        'right': '-8px',
                        'min-width': '18px',
                        'height': '18px',
                        'text-align': 'center',
                        'line-height': '14px',
                        'z-index': '1000'
                    });
                } else {
                    $headerBadge.hide();
                }
            });
        },
        
        /**
         * チャンネル別未読数を取得
         */
        getUnreadCountForChannel: function(channelId, callback) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_channel_unread_count',
                    channel_id: channelId,
                    nonce: window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                    if (response.success && response.data) {
                        callback(response.data.count || 0);
                    } else {
                        callback(0);
                    }
                },
                error: () => callback(0)
            });
        },
        
        /**
         * スレッド別未読数を取得
         */
        getUnreadCountForThread: function(parentMessageId, callback) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_thread_unread_count',
                    parent_message_id: parentMessageId,
                    nonce: window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                    if (response.success && response.data) {
                        callback(response.data.count || 0);
                    } else {
                        callback(0);
                    }
                },
                error: () => callback(0)
            });
        },
        
        /**
         * 全体の未読数を取得
         */
        getTotalUnreadCount: function(callback) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_total_unread_count',
                    nonce: window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                    if (response.success && response.data) {
                        callback(response.data.count || 0);
                    } else {
                        callback(0);
                    }
                },
                error: () => callback(0)
            });
        },
        
        /**
         * チャンネル切り替え時の既読処理
         */
        markChannelAsRead: function(channelId) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_channel_as_read_realtime',
                    channel_id: channelId,
                    nonce: window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                    if (response.success) {
                        
                        $(`.channel-item[data-channel-id="${channelId}"] .unread-badge`).hide();
                        
                        this.updateHeaderBadge();
                    }
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * スレッド切り替え時の既読処理
         */
        markThreadAsRead: function(parentMessageId) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_thread_as_read_realtime',
                    parent_message_id: parentMessageId,
                    nonce: window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                    if (response.success) {
                        
                        $(`[data-message-id="${parentMessageId}"] .thread-unread-badge`).hide();
                        
                        this.updateHeaderBadge();
                    }
                },
                error: (xhr, status, error) => {
                }
            });
        }
    };
    
    $(document).ready(function() {
        window.LMSRealtimeUnreadSystem.init();
        
        setTimeout(() => {
            window.LMSRealtimeUnreadSystem.init();
        }, 500);
        
        setTimeout(() => {
            window.LMSRealtimeUnreadSystem.init();
        }, 1500);
    });
    
    $(window).on('load', function() {
        setTimeout(() => {
            window.LMSRealtimeUnreadSystem.init();
        }, 1000);
    });
    
    $(document).on('lms:channel:switched', function(e, channelId) {
        window.LMSRealtimeUnreadSystem.currentChannelId = channelId;
        window.LMSRealtimeUnreadSystem.markChannelAsRead(channelId);
    });
    
    $(document).on('lms:thread:opened', function(e, parentMessageId) {
        window.LMSRealtimeUnreadSystem.markThreadAsRead(parentMessageId);
    });
    
})(jQuery);