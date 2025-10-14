/**
 * LMS ヘッダーチャットアイコン未読バッジシステム
 * チャンネル名バッジは動作するが、ヘッダーバッジが表示されない問題を解決
 */
(function($) {
    'use strict';
    
    window.LMSHeaderUnreadBadge = {
        initialized: false,
        currentUserId: null,
        totalUnreadCount: 0,
        badgeElement: null,
        
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
                                window.LMSChat?.state?.currentUserId ||
                                parseInt(document.body.getAttribute('data-user-id')) ||
                                null;
            
            if (!this.currentUserId) {
                return;
            }
            
            this.ensureBadgeElement();
            
            this.loadInitialUnreadCount();
            
            this.setupMessageReceptionMonitoring();
            
            this.setupChannelSwitchMonitoring();
            
            this.initialized = true;
        },
        
        /**
         * バッジ要素を確保・作成
         */
        ensureBadgeElement: function() {
            $('.site-header .chat-icon-wrapper .chat-icon .unread-badge').remove();
            
            const $chatIcon = $('.site-header .chat-icon-wrapper .chat-icon');
            if ($chatIcon.length === 0) {
                return;
            }
            
            const $badge = $('<span class="unread-badge header-badge universal-header-badge unread-badge-hide"></span>');
            $chatIcon.append($badge);
            
            this.badgeElement = $badge.get(0);
        },
        
        /**
         * 初期未読数を読み込み
         */
        loadInitialUnreadCount: function() {
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
                        this.totalUnreadCount = parseInt(response.data.count) || 0;
                        this.updateBadgeDisplay();
                    }
                },
                error: (xhr, status, error) => {
                    this.totalUnreadCount = 0;
                    this.updateBadgeDisplay();
                }
            });
        },
        
        /**
         * バッジ表示を更新
         */
        updateBadgeDisplay: function() {
            if (!this.badgeElement) {
                this.ensureBadgeElement();
            }
            
            if (!this.badgeElement) {
                return;
            }
            
            const $badge = $(this.badgeElement);
            
            if (this.totalUnreadCount > 0) {
                $badge.text(this.totalUnreadCount);
                $badge.html(this.totalUnreadCount);
                
                $badge.removeAttr('style');
                
                setTimeout(() => {
                    if ($badge.text() && $badge.text().trim() !== '') {
                        $badge.removeClass('unread-badge-hide');
                        
                        $badge.addClass('visible show has-content');
                        
                        if (this.totalUnreadCount >= 10) {
                            $badge.addClass('multi-digit');
                        } else {
                            $badge.removeClass('multi-digit');
                        }
                        
                        $badge.addClass('new-message');
                        setTimeout(() => {
                            $badge.removeClass('new-message');
                        }, 4500);
                        
                        $('body').addClass('force-show-header-badge');
                    } else {
                        $badge.addClass('unread-badge-hide');
                    }
                }, 10);
                
            } else {
                $badge.text('');
                $badge.html('');
                
                $badge.removeAttr('style');
                
                $badge.removeClass('visible show new-message multi-digit has-content');
                
                $badge.addClass('unread-badge-hide');
                
                $('body').removeClass('force-show-header-badge');
            }
        },
        
        /**
         * 新規メッセージ受信監視
         */
        setupMessageReceptionMonitoring: function() {
            const self = this;
            
            $(document).on('lms-header-badge-update', function(event, count) {
                self.totalUnreadCount = parseInt(count) || 0;
                self.updateBadgeDisplay();
            });
            
            $(document).on('lms-new-message', function(event) {
                if (event.detail && event.detail.user_id != self.currentUserId) {
                    self.incrementUnreadCount();
                }
            });
            
            $(document).on('update-header-unread-badge', function(event, count) {
                self.totalUnreadCount = parseInt(count) || 0;
                self.updateBadgeDisplay();
            });
        },
        
        /**
         * チャンネル切り替え監視
         */
        setupChannelSwitchMonitoring: function() {
            const self = this;
            
            $(document).on('click', '.channel-item', function() {
                setTimeout(() => {
                    self.loadInitialUnreadCount();
                }, 500);
            });
        },
        
        /**
         * 未読数を1増加
         */
        incrementUnreadCount: function() {
            this.totalUnreadCount++;
            this.updateBadgeDisplay();
        },
        
        /**
         * 未読数を設定
         */
        setUnreadCount: function(count) {
            this.totalUnreadCount = parseInt(count) || 0;
            this.updateBadgeDisplay();
        },
        
        /**
         * 未読数をリセット
         */
        resetUnreadCount: function() {
            this.totalUnreadCount = 0;
            this.updateBadgeDisplay();
        }
    };
    
    $(document).ready(function() {
        window.cleanupEmptyHeaderBadges && window.cleanupEmptyHeaderBadges();
        
        window.LMSHeaderUnreadBadge.init();
        
        setTimeout(() => {
            window.cleanupEmptyHeaderBadges && window.cleanupEmptyHeaderBadges();
            window.LMSHeaderUnreadBadge.init();
        }, 1000);
    });
    
    $(window).on('load', function() {
        setTimeout(() => {
            window.LMSHeaderUnreadBadge.init();
        }, 500);
    });
    
    window.updateHeaderBadge = function(count) {
        if (window.LMSHeaderUnreadBadge) {
            window.LMSHeaderUnreadBadge.setUnreadCount(count);
        }
    };
    
    window.cleanupEmptyHeaderBadges = function() {
        $('.site-header .chat-icon-wrapper .chat-icon .unread-badge').each(function() {
            const $badge = $(this);
            if (!$badge.text() || $badge.text().trim() === '') {
                $badge.text('');
                $badge.html('');
                
                $badge.removeAttr('style');
                
                $badge.removeClass('visible show new-message multi-digit has-content');
                
                $badge.addClass('unread-badge-hide');
            }
        });
        $('body').removeClass('force-show-header-badge');
    };
})(jQuery);
