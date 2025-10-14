/**
 * LMS汎用未読バッジシステム
 * 新規メッセージ受信時に確実にバッジを表示
 */
(function($) {
    'use strict';
    window.LMSUniversalUnreadBadge = {
        initialized: false,
        currentUserId: null,
        currentChannelId: null,
        unreadCounts: {
            total: 0,
            channels: {},
            threads: {}
        },
        
        /**
         * 初期化
         */
        init: function() {
            if (this.initialized) {
                return;
            }
            this.currentUserId = window.lmsUnreadConfig?.currentUserId ||
                                window.lmsChat?.currentUserId || 
                                window.LMSChat?.currentUserId || 
                                window.LMSChat?.state?.currentUserId;
            
            this.currentChannelId = window.lmsChat?.state?.currentChannel || 
                                   window.LMSChat?.state?.currentChannel;
            this.hookIntoMessageReception();
            
            this.createBadgeElements();
            
            this.loadInitialUnreadCounts();
            
            this.initialized = true;
        },
        
        /**
         * データベースから初期未読数を読み込み
         */
        loadInitialUnreadCounts: function() {
            
            const self = this;
            
            const ajaxUrl = window.lmsUnreadConfig?.ajaxUrl || window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php';
            const nonce = window.lmsUnreadConfig?.nonce || window.lmsChat?.nonce || window.LMSChat?.nonce;
            if (!nonce) {
                return;
            }
            
            $.ajax({
                url: ajaxUrl,
                type: 'POST',
                data: {
                    action: 'lms_get_total_unread_count',
                    nonce: nonce
                },
                success: (response) => {
                    if (response.success && response.data) {
                        self.unreadCounts.total = response.data.count || 0;
                        self.updateHeaderBadge();
                    } else {
                    }
                },
                error: (xhr, status, error) => {
                }
            });
            
            $('.channel-item').each(function() {
                const channelId = $(this).attr('data-channel-id');
                if (channelId) {
                    $.ajax({
                        url: ajaxUrl,
                        type: 'POST',
                        data: {
                            action: 'lms_get_channel_unread_count',
                            channel_id: channelId,
                            nonce: nonce
                        },
                        success: (response) => {
                            if (response.success && response.data) {
                                self.unreadCounts.channels[channelId] = response.data.count || 0;
                                if (response.data.count > 0) {
                                    self.updateChannelBadges();
                                }
                            } else {
                            }
                        },
                        error: (xhr, status, error) => {
                        }
                    });
                }
            });
        },
        
        /**
         * メッセージ受信をフック
         */
        hookIntoMessageReception: function() {
            const self = this;
            
            if (window.LMSChat?.messages?.appendMessage) {
                const originalAppendMessage = window.LMSChat.messages.appendMessage;
                window.LMSChat.messages.appendMessage = function(message, options) {
                    const result = originalAppendMessage.apply(this, arguments);
                    
                    if (options?.fromLongPoll && options?.markAsUnread) {
                        const messageUserId = parseInt(message.user_id || 0);
                        const currentUserId = parseInt(self.currentUserId || 0);
                        
                        if (messageUserId !== currentUserId && messageUserId > 0) {
                            self.handleNewMessage(message);
                        }
                    }
                    
                    return result;
                };
            }
            
            if (window.lmsUnifiedSync?.processNewMessages) {
                const originalProcessNewMessages = window.lmsUnifiedSync.processNewMessages;
                window.lmsUnifiedSync.processNewMessages = async function(messages) {
                    const result = await originalProcessNewMessages.apply(this, arguments);
                    
                    if (messages && messages.length > 0) {
                        messages.forEach(message => {
                            const messageUserId = parseInt(message.user_id || 0);
                            const currentUserId = parseInt(self.currentUserId || 0);
                            
                            if (messageUserId !== currentUserId && messageUserId > 0) {
                                self.handleNewMessage(message);
                            }
                        });
                    }
                    
                    return result;
                };
            }
            
            this.setupLongPollMonitoring();
            
        },
        
        /**
         * Long Pollシステムを直接監視
         */
        setupLongPollMonitoring: function() {
            const self = this;
            
            setInterval(() => {
                if (window.lmsLastReceivedMessage) {
                    const message = window.lmsLastReceivedMessage;
                    const messageUserId = parseInt(message.user_id || 0);
                    const currentUserId = parseInt(self.currentUserId || 0);
                    
                    if (messageUserId !== currentUserId && messageUserId > 0) {
                        self.handleNewMessage(message);
                        window.lmsLastReceivedMessage = null;
                    }
                }
            }, 1000);
            
            document.addEventListener('lms-new-message', (event) => {
                const message = event.detail;
                if (message) {
                    self.handleNewMessage(message);
                }
            });
            
        },
        
        /**
         * バッジ要素を作成
         */
        createBadgeElements: function() {
            if ($('.chat-icon-wrapper .chat-icon').length > 0) {
                if ($('.chat-icon-wrapper .chat-icon .universal-header-badge').length === 0) {
                    $('.chat-icon-wrapper .chat-icon').append(
                        '<span class="unread-badge universal-header-badge header-badge unread-badge-hide"></span>'
                    );
                }
            }
            
            $('.channel-item').each(function() {
                const $channel = $(this);
                const channelId = $channel.attr('data-channel-id');
                
                if (channelId && $channel.find('.universal-channel-badge').length === 0) {
                    $channel.append(
                        '<span class="unread-badge universal-channel-badge unread-badge-hide"></span>'
                    );
                }
            });
            
        },
        
        /**
         * 新規メッセージ処理
         */
        handleNewMessage: function(message) {
            
            const channelId = message.channel_id || message.channelId;
            const messageId = message.id;
            const userId = message.user_id || message.userId;
            
            if (parseInt(userId) === parseInt(this.currentUserId)) {
                return;
            }
            
            if (!this.unreadCounts.channels[channelId]) {
                this.unreadCounts.channels[channelId] = 0;
            }
            this.unreadCounts.channels[channelId]++;
            
            this.unreadCounts.total++;
            this.updateBadges();
            
            this.saveUnreadToDatabase(messageId, channelId);
        },
        
        /**
         * メッセージを既読にしてバッジを減算
         */
        markMessageAsRead: function(messageId, channelId) {
            
            if (this.unreadCounts.channels[channelId] && this.unreadCounts.channels[channelId] > 0) {
                this.unreadCounts.channels[channelId]--;
            }
            
            if (this.unreadCounts.total > 0) {
                this.unreadCounts.total--;
            }
            
            this.updateBadges();
            
            this.removeUnreadFromDatabase(messageId);
        },
        
        /**
         * データベースから未読レコードを削除
         */
        removeUnreadFromDatabase: function(messageId) {
            const self = this;
            const ajaxUrl = window.lmsUnreadConfig?.ajaxUrl || window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php';
            const nonce = window.lmsUnreadConfig?.nonce || window.lmsChat?.nonce || window.LMSChat?.nonce;
            
            if (!nonce) {
                return;
            }
            
            window.LMSUnreadBadgeDbSyncBlocked = true;
            
            $.ajax({
                url: ajaxUrl,
                type: 'POST',
                data: {
                    action: 'lms_remove_unread_message',
                    message_id: messageId,
                    nonce: nonce
                },
                success: (response) => {
                    if (response.success) {
                    } else {
                    }
                    
                    setTimeout(() => {
                        window.LMSUnreadBadgeDbSyncBlocked = false;
                        
                        if (window.LMSChat && window.LMSChat.readOnView) {
                            window.LMSChatReadOnViewSyncBlocked = false;
                        }
                    }, 1000);
                },
                error: (xhr, status, error) => {
                    
                    setTimeout(() => {
                        window.LMSUnreadBadgeDbSyncBlocked = false;
                    }, 1000);
                }
            });
        },
        
        /**
         * スレッドメッセージ処理
         */
        handleNewThreadMessage: function(message) {
            
            const parentId = message.parent_message_id || message.parentMessageId || message.thread_id;
            const messageId = message.id;
            const userId = message.user_id || message.userId;
            
            if (parseInt(userId) === parseInt(this.currentUserId)) {
                return;
            }
            
            if (!this.unreadCounts.threads[parentId]) {
                this.unreadCounts.threads[parentId] = 0;
            }
            this.unreadCounts.threads[parentId]++;
            
            this.unreadCounts.total++;
            
            this.updateThreadBadge(parentId);
            this.updateHeaderBadge();
            
            this.saveThreadUnreadToDatabase(messageId, parentId);
        },
        
        /**
         * バッジを更新
         */
        updateBadges: function() {
            this.updateHeaderBadge();
            this.updateChannelBadges();
        },
        
        /**
         * ヘッダーバッジを更新
         */
        updateHeaderBadge: function() {
            
            const selectors = [
                '.header-container .chat-icon .unread-badge',
                '.header .chat-icon .unread-badge',
                '.chat-icon-wrapper .chat-icon .unread-badge',
                '.chat-icon-wrapper .unread-badge',
                '.chat-icon .unread-badge',
                '#header-chat-badge',
                '.header-unread-badge',
                '.universal-header-badge',
                '.header-badge-alternative'
            ];
            
            let $badge = null;
            let foundSelector = null;
            for (const selector of selectors) {
                $badge = $(selector).first();
                if ($badge.length > 0) {
                    foundSelector = selector;
                    break;
                }
            }
            
            if (!$badge || $badge.length === 0) {
                
                const chatIconSelectors = [
                    '.header-container .chat-icon',
                    '.header .chat-icon', 
                    '.chat-icon-wrapper .chat-icon',
                    '.chat-icon'
                ];
                
                let $chatIcon = null;
                for (const iconSelector of chatIconSelectors) {
                    $chatIcon = $(iconSelector).first();
                    if ($chatIcon.length > 0) {
                        break;
                    }
                }
                if ($chatIcon && $chatIcon.length > 0) {
                    $badge = $chatIcon.find('.unread-badge').first();
                    if ($badge.length === 0) {
                        $badge = $('<span class="unread-badge universal-header-badge"></span>');
                        $chatIcon.append($badge);
                    }
                } else {
                    
                    const $channelName = $('#current-channel-name, .channel-header-text').first();
                    if ($channelName.length > 0) {
                        $badge = $('#chat-total-unread-badge');
                        if ($badge.length === 0) {
                            $badge = $('<span id="chat-total-unread-badge" class="unread-badge header-badge-alternative" style="margin-left: 10px; background-color: #ff4444; color: white; border-radius: 12px; padding: 2px 8px; font-size: 12px; font-weight: bold; display: inline-block;"></span>');
                            $channelName.after($badge);
                        }
                    } else {
                        const $chatHeader = $('.chat-header').first();
                        if ($chatHeader.length > 0) {
                            $badge = $('#chat-total-unread-badge');
                            if ($badge.length === 0) {
                                $badge = $('<span id="chat-total-unread-badge" class="unread-badge header-badge-alternative" style="position: absolute; top: 10px; right: 10px; background-color: #ff4444; color: white; border-radius: 12px; padding: 2px 8px; font-size: 12px; font-weight: bold;"></span>');
                                $chatHeader.css('position', 'relative').append($badge);
                            }
                        }
                    }
                }
            }
            
            if (window.LMSHeaderUnreadBadge && window.LMSHeaderUnreadBadge.initialized) {
                window.LMSHeaderUnreadBadge.setUnreadCount(this.unreadCounts.total);
            }
            
            $(document).trigger('lms-header-badge-update', [this.unreadCounts.total]);
            $(document).trigger('update-header-unread-badge', [this.unreadCounts.total]);
            
            if ($badge && $badge.length > 0) {
                if (this.unreadCounts.total > 0) {
                    $badge.text(this.unreadCounts.total);
                    
                    $badge.removeAttr('style');
                    
                    $badge.removeClass('unread-badge-hide');
                    
                    $badge.addClass('visible show has-content');
                    
                    const $parent = $badge.parent();
                    if ($parent.css('position') === 'static') {
                        $parent.css('position', 'relative');
                    }
                    
                } else {
                    $badge.text('');
                    $badge.html('');
                    
                    $badge.removeAttr('style');
                    
                    $badge.removeClass('visible show has-content');
                    
                    $badge.addClass('unread-badge-hide');
                }
            } else {
            }
        },
        
        /**
         * チャンネルバッジを更新
         */
        updateChannelBadges: function() {
            Object.keys(this.unreadCounts.channels).forEach(channelId => {
                const count = this.unreadCounts.channels[channelId];
                const $badge = $(`.channel-item[data-channel-id="${channelId}"] .unread-badge, .channel-item[data-channel-id="${channelId}"] .universal-channel-badge`).first();
                
                if ($badge.length > 0) {
                    if (count > 0) {
                        $badge.text(count);
                        
                        $badge.removeAttr('style');
                        
                        $badge.removeClass('unread-badge-hide');
                        
                        $badge.addClass('visible show has-content');
                    } else {
                        $badge.text('');
                        $badge.html('');
                        
                        $badge.removeAttr('style');
                        
                        $badge.removeClass('visible show has-content');
                        
                        $badge.addClass('unread-badge-hide');
                    }
                }
            });
        },
        
        /**
         * スレッドバッジを更新
         */
        updateThreadBadge: function(parentId) {
            const count = this.unreadCounts.threads[parentId] || 0;
            const $threadInfo = $(`[data-message-id="${parentId}"] .thread-info`);
            
            if ($threadInfo.length > 0) {
                let $badge = $threadInfo.find('.thread-unread-badge');
                
                if ($badge.length === 0) {
                    $badge = $('<span class="thread-unread-badge"></span>');
                    $threadInfo.append($badge);
                }
                
                if (count > 0) {
                    $badge.text(count).css({
                        'display': 'inline-block',
                        'background-color': '#ff4444',
                        'color': '#ffffff',
                        'border-radius': '10px',
                        'padding': '2px 6px',
                        'font-size': '10px',
                        'font-weight': 'bold',
                        'margin-left': '5px'
                    }).show();
                } else {
                    $badge.hide();
                }
            }
        },
        
        /**
         * データベースに未読を保存
         */
        saveUnreadToDatabase: function(messageId, channelId) {
            
            $.ajax({
                url: window.lmsUnreadConfig?.ajaxUrl || window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_message_as_unread_realtime',
                    message_id: messageId,
                    channel_id: channelId,
                    message_type: 'main',
                    nonce: window.lmsUnreadConfig?.nonce || window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * スレッド未読をデータベースに保存
         */
        saveThreadUnreadToDatabase: function(messageId, parentId) {
            
            $.ajax({
                url: window.lmsUnreadConfig?.ajaxUrl || window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_message_as_unread_realtime',
                    message_id: messageId,
                    parent_message_id: parentId,
                    message_type: 'thread',
                    nonce: window.lmsUnreadConfig?.nonce || window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * チャンネル切り替え時の処理
         */
        onChannelSwitch: function(channelId) {
            
            this.currentChannelId = channelId;
            
            if (this.unreadCounts.channels[channelId]) {
                const clearedCount = this.unreadCounts.channels[channelId];
                
                this.unreadCounts.total -= clearedCount;
                this.unreadCounts.channels[channelId] = 0;
                this.updateBadges();
                
                this.clearChannelUnreadFromDatabase(channelId);
            }
            
            this.markChannelAsRead(channelId);
        },
        
        /**
         * チャンネルの未読フラグをデータベースからクリア
         */
        clearChannelUnreadFromDatabase: function(channelId) {
            
            window.LMSUnreadBadgeDbSyncBlocked = true;
            
            $.ajax({
                url: window.lmsChat?.ajaxurl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_channel_read',
                    channel_id: channelId,
                    nonce: window.lmsUnreadConfig?.nonce || window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                    setTimeout(() => {
                        window.LMSUnreadBadgeDbSyncBlocked = false;
                    }, 1000);
                },
                error: (xhr, status, error) => {
                    setTimeout(() => {
                        window.LMSUnreadBadgeDbSyncBlocked = false;
                    }, 1000);
                }
            });
        },
        
        /**
         * チャンネルを既読にする
         */
        markChannelAsRead: function(channelId) {
            
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_channel_as_read_realtime',
                    channel_id: channelId,
                    nonce: window.lmsUnreadConfig?.nonce || window.lmsChat?.nonce || window.LMSChat?.nonce
                },
                success: (response) => {
                },
                error: (xhr, status, error) => {
                }
            });
        }
    };
    
    $(document).ready(function() {
        
        window.LMSUniversalUnreadBadge.init();
        
        setTimeout(() => {
            window.LMSUniversalUnreadBadge.init();
        }, 1000);
    });
    
    $(window).on('load', function() {
        setTimeout(() => {
            window.LMSUniversalUnreadBadge.init();
        }, 500);
    });
    
    $(document).on('click', '.channel-item', function() {
        const channelId = $(this).attr('data-channel-id');
        if (channelId) {
            window.LMSUniversalUnreadBadge.onChannelSwitch(channelId);
        }
    });
})(jQuery);
