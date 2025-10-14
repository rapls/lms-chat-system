/**
 * LMS統合バッジ管理システム
 * 全てのバッジ管理を一元化し、競合を排除
 */
(function($) {
    'use strict';
    const BadgeState = {
        headerCount: 0,
        channelCounts: new Map(),
        isLocked: false,
        lockUntil: 0,
        initialized: false,
        updateQueue: [],
        processingQueue: false
    };
    
    window.LMSUnifiedBadgeManager = {
        
        /**
         * 初期化
         */
        init: function() {
            if (BadgeState.initialized) return;
            this.disableOtherSystems();
            
            this.ensureBadgeElements();
            
            const currentChannelId = window.lmsChat?.state?.currentChannel;
            if (currentChannelId) {
                this.onChannelSwitch(currentChannelId);
            }
            
            this.loadInitialState();
            
            BadgeState.initialized = true;
            
            this.startHiddenClassWatcher();
            
        },
        
        /**
         * 隠しクラス監視システム
         */
        startHiddenClassWatcher: function() {
            
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const $target = $(mutation.target);
                        if ($target.hasClass('unread-badge')) {
                            const hasHiddenClass = $target.hasClass('chat-element-hidden') ||
                                                 $target.hasClass('badge-controller-hidden') ||
                                                 $target.hasClass('badge-controller-blocked');
                            
                            if (hasHiddenClass) {
                                $target.removeClass('chat-element-hidden')
                                    .removeClass('badge-controller-hidden')
                                    .removeClass('badge-controller-blocked');
                                
                                const text = $target.text();
                                if (text && text !== '0' && text !== '') {
                                    $target.show();
                                }
                            }
                        }
                    }
                });
            });
            
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class'],
                subtree: true
            });
            
            setInterval(() => {
                $('.unread-badge').each(function() {
                    const $badge = $(this);
                    const hasHiddenClass = $badge.hasClass('chat-element-hidden') ||
                                         $badge.hasClass('badge-controller-hidden') ||
                                         $badge.hasClass('badge-controller-blocked');
                    
                    if (hasHiddenClass) {
                        $badge.removeClass('chat-element-hidden')
                            .removeClass('badge-controller-hidden')
                            .removeClass('badge-controller-blocked');
                    }
                });
            }, 2000);
        },
        
        /**
         * 他のバッジ管理システムを無効化
         */
        disableOtherSystems: function() {
            
            window.LMSBadgeUpdateBlocked = true;
            
            if (window.LMSChatBadgeController) {
                window.LMSChatBadgeController.isSystemPaused = true;
                window.LMSChatBadgeController.isLocked = () => true;
            }
            
            if (window.lmsUnifiedSync) {
                window.lmsUnifiedSync.pauseForChannelSwitch = function() {
                };
            }
        },
        
        /**
         * バッジ要素が確実に存在することを確認
         */
        ensureBadgeElements: function() {
            
            let $headerBadge = $('.chat-icon-wrapper .chat-icon .unread-badge');
            if ($headerBadge.length === 0) {
                const $chatIcon = $('.chat-icon-wrapper .chat-icon');
                if ($chatIcon.length > 0) {
                    $headerBadge = $('<span class="unread-badge" data-unified-badge="header">0</span>');
                    $chatIcon.append($headerBadge);
                } else {
                    return;
                }
            } else {
                $headerBadge.removeClass('chat-element-hidden')
                    .removeClass('badge-controller-hidden')
                    .removeClass('badge-controller-blocked')
                    .attr('data-unified-badge', 'header');
            }
            
            $('.channel-item').each(function() {
                const $channel = $(this);
                const channelId = $channel.attr('data-channel-id');
                if (!channelId) return;
                
                let $channelBadge = $channel.find('.unread-badge');
                if ($channelBadge.length === 0) {
                    $channelBadge = $('<span class="unread-badge" data-unified-badge="channel">0</span>');
                    $channel.append($channelBadge);
                } else {
                    $channelBadge.removeClass('chat-element-hidden')
                        .removeClass('badge-controller-hidden')
                        .removeClass('badge-controller-blocked')
                        .attr('data-unified-badge', 'channel');
                }
            });
            
        },
        
        /**
         * 初期状態をロード
         */
        loadInitialState: function() {
            
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_unread_count',
                    nonce: window.lmsChat?.nonce,
                    force_refresh: true
                },
                success: (response) => {
                    if (response && response.success && response.data) {
                        BadgeState.headerCount = response.data.total_unread || 0;
                        
                        if (response.data.channels) {
                            Object.entries(response.data.channels).forEach(([channelId, count]) => {
                                BadgeState.channelCounts.set(channelId, count);
                            });
                        }
                        
                        this.updateAllBadges();
                    }
                },
                error: (xhr, status, error) => {
                    BadgeState.headerCount = 0;
                    this.updateAllBadges();
                }
            });
        },
        
        /**
         * 新規メッセージ受信時のバッジ更新
         */
        onNewMessage: function(message) {
            
            if (message.user_id && parseInt(message.user_id) === parseInt(window.lmsChat?.currentUserId)) {
                return;
            }
            
            BadgeState.headerCount++;
            
            const channelId = String(message.channel_id);
            const currentChannelCount = BadgeState.channelCounts.get(channelId) || 0;
            BadgeState.channelCounts.set(channelId, currentChannelCount + 1);
            
            this.updateAllBadges();
            
            this.markMessageAsUnread(message);
        },
        
        /**
         * 全てのバッジを更新
         */
        updateAllBadges: function() {
            
            this.updateHeaderBadge();
            
            this.updateChannelBadges();
            
        },
        
        /**
         * ヘッダーバッジ更新
         */
        updateHeaderBadge: function() {
            let $headerBadge = $('.chat-icon-wrapper .chat-icon .unread-badge').first();
            
            if ($headerBadge.length === 0) {
                return;
            }
            
            const count = BadgeState.headerCount;
            
            if (count > 0) {
                $headerBadge.removeClass('chat-element-hidden')
                    .removeClass('badge-controller-hidden')
                    .removeClass('badge-controller-blocked');
                
                $headerBadge.text(count).attr('style', `
                    display: inline-block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    background-color: #ff4444 !important;
                    color: #ffffff !important;
                    border-radius: 50% !important;
                    padding: 2px 6px !important;
                    font-size: 11px !important;
                    font-weight: bold !important;
                    position: absolute !important;
                    top: -8px !important;
                    right: -8px !important;
                    min-width: 18px !important;
                    height: 18px !important;
                    text-align: center !important;
                    line-height: 14px !important;
                    z-index: 1000 !important;
                `).show();
                
                $headerBadge.attr('data-unified-badge', 'header');
                
            } else {
                $headerBadge.removeClass('chat-element-hidden')
                    .removeClass('badge-controller-hidden')
                    .removeClass('badge-controller-blocked')
                    .hide();
            }
            
        },
        
        /**
         * チャンネルバッジ更新
         */
        updateChannelBadges: function() {
            $('.channel-item').each((index, element) => {
                const $channel = $(element);
                const channelId = $channel.attr('data-channel-id');
                if (!channelId) return;
                
                let $channelBadge = $channel.find('.unread-badge').first();
                if ($channelBadge.length === 0) return;
                
                const count = BadgeState.channelCounts.get(channelId) || 0;
                
                if (count > 0) {
                    $channelBadge.removeClass('chat-element-hidden')
                        .removeClass('badge-controller-hidden')
                        .removeClass('badge-controller-blocked');
                    
                    $channelBadge.text(count).attr('style', `
                        display: inline-block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        background-color: #ff4444 !important;
                        color: #ffffff !important;
                        border-radius: 12px !important;
                        padding: 2px 6px !important;
                        font-size: 11px !important;
                        font-weight: bold !important;
                        margin-left: 5px !important;
                        z-index: 999 !important;
                    `).show();
                    
                    $channelBadge.attr('data-unified-badge', 'channel');
                    
                } else {
                    $channelBadge.removeClass('chat-element-hidden')
                        .removeClass('badge-controller-hidden')
                        .removeClass('badge-controller-blocked')
                        .hide();
                }
                
            });
        },
        
        /**
         * データベースに未読フラグ設定
         */
        markMessageAsUnread: function(message) {
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_message_as_unread',
                    message_id: message.id,
                    channel_id: message.channel_id,
                    thread_id: message.parent_message_id || null,
                    nonce: window.lmsChat?.nonce
                },
                success: (response) => {
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * チャンネル切り替え時の既読処理
         */
        onChannelSwitch: function(channelId) {
            
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_channel_as_read',
                    channel_id: channelId,
                    nonce: window.lmsChat?.nonce
                },
                success: (response) => {
                    
                    this.refreshFromDatabase();
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * メッセージ既読処理
         */
        markMessagesAsRead: function(messageIds) {
            if (!messageIds || messageIds.length === 0) return;
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_mark_messages_as_read',
                    message_ids: messageIds,
                    nonce: window.lmsChat?.nonce
                },
                success: (response) => {
                    this.refreshFromDatabase();
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * データベースから最新の未読数を取得してバッジを更新
         */
        refreshFromDatabase: function() {
            
            $.ajax({
                url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
                type: 'POST',
                data: {
                    action: 'lms_get_unread_count',
                    nonce: window.lmsChat?.nonce,
                    force_refresh: true
                },
                success: (response) => {
                    if (response && response.success && response.data) {
                        
                        BadgeState.headerCount = response.data.total_unread || 0;
                        
                        BadgeState.channelCounts.clear();
                        if (response.data.channels) {
                            Object.entries(response.data.channels).forEach(([channelId, count]) => {
                                BadgeState.channelCounts.set(String(channelId), count);
                            });
                        }
                        
                        this.updateAllBadges();
                    } else {
                    }
                },
                error: (xhr, status, error) => {
                }
            });
        },
        
        /**
         * 状態確認（デバッグ用）
         */
        getStatus: function() {
            return {
                initialized: BadgeState.initialized,
                headerCount: BadgeState.headerCount,
                channelCounts: Object.fromEntries(BadgeState.channelCounts),
                headerBadgeElement: $('.chat-icon-wrapper .chat-icon .unread-badge').length,
                headerBadgeVisible: $('.chat-icon-wrapper .chat-icon .unread-badge').is(':visible'),
                headerBadgeText: $('.chat-icon-wrapper .chat-icon .unread-badge').text(),
                allBadges: $('.unread-badge').map((i, el) => ({
                    element: el,
                    text: $(el).text(),
                    visible: $(el).is(':visible'),
                    css: $(el)[0].style.cssText
                })).get()
            };
        }
    };
    
    $(document).ready(function() {
        setTimeout(() => {
            window.LMSUnifiedBadgeManager.init();
        }, 1000);
    });
    
    $(window).on('load', function() {
        setTimeout(() => {
            if (!BadgeState.initialized) {
                window.LMSUnifiedBadgeManager.init();
            }
        }, 2000);
    });
    
    window.showBadgeStatus = () => {
    };
    
    window.refreshBadgesFromDatabase = () => {
        window.LMSUnifiedBadgeManager.refreshFromDatabase();
    };
    
    window.markChannelAsRead = (channelId) => {
        window.LMSUnifiedBadgeManager.onChannelSwitch(channelId);
    };
})(jQuery);