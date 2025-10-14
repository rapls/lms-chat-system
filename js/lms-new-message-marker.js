/**
 * LMS New Message Marker System
 * 受信メッセージにNewマークを付加するシステム
 */
(function($) {
    'use strict';

    window.LMSNewMessageMarker = window.LMSNewMessageMarker || {};

    const CONFIG = {
        DEBUG_MODE: true,
        NEW_MARK_DURATION: 30000,
        VISIBILITY_THRESHOLD: 0.5,
        CHECK_INTERVAL: 1000
    };

    const STATE = {
        initialized: false,
        markedMessages: new Set(),
        observer: null,
        autoRemoveTimers: new Map(),
        scrollPreventionActive: false
    };

    /**
     * デバッグログ
     */
    function debugLog(message, data = null) {
        if (CONFIG.DEBUG_MODE) {
            const timestamp = new Date().toLocaleTimeString();
            if (data) {
            } else {
            }
        }
    }

    /**
     * 現在のユーザーIDを取得
     */
    function getCurrentUserId() {
        return window.LMSChat?.state?.currentUser || 
               parseInt($('#current-user-id').val()) || 
               0;
    }

    /**
     * 現在のチャンネルIDを取得
     */
    function getCurrentChannelId() {
        return window.LMSChat?.state?.currentChannel || 
               parseInt($('.channel-item.active').attr('data-channel-id')) || 
               1;
    }

    /**
     * 未読バッジを増やす（安全な呼び出し）
     */
    function addUnreadBadge(messageId, channelId) {
        const tryAddBadge = (attempt = 1) => {
            if (window.LMSUnreadBadgeManager && typeof window.LMSUnreadBadgeManager.addUnread === 'function') {
                debugLog(`未読バッジを追加`, { messageId, channelId });
                window.LMSUnreadBadgeManager.addUnread(messageId, channelId);
            } else if (attempt <= 5) {
                setTimeout(() => tryAddBadge(attempt + 1), 500);
            } else {
                debugLog(`未読バッジ追加に失敗: LMSUnreadBadgeManagerが利用できません`);
            }
        };
        tryAddBadge();
    }

    /**
     * 未読バッジを減らす（安全な呼び出し）
     */
    function removeUnreadBadge(messageId, channelId) {
        if (window.LMSUnreadBadgeManager && typeof window.LMSUnreadBadgeManager.removeUnread === 'function') {
            debugLog(`未読バッジを削除`, { messageId, channelId });
            window.LMSUnreadBadgeManager.removeUnread(messageId, channelId);
        } else {
            debugLog(`未読バッジ削除に失敗: LMSUnreadBadgeManagerが利用できません`);
        }
    }

    /**
     * メッセージにNewマークを追加
     */
    function addNewMark($message, messageId) {
        if (STATE.markedMessages.has(messageId)) {
            return;
        }

        const $messageMeta = $message.find('.message-meta');
        if ($messageMeta.length === 0) {
            return;
        }

        if ($message.find('.new-mark').length > 0) {
            STATE.markedMessages.add(messageId);
            debugLog(`メッセージ ${messageId} には既にNewマークがあります`);
            return;
        }

        const $newMark = $('<span class="new-mark">New</span>');
        $newMark.css({
            'opacity': '0',
            'display': 'inline-block'
        });
        
        $messageMeta.append($newMark);
        
        setTimeout(() => {
            $newMark.animate({ opacity: 1 }, 300);
        }, 10);

        STATE.markedMessages.add(messageId);
        debugLog(`メッセージ ${messageId} にNewマークを追加しました`);

        const channelId = parseInt($message.attr('data-channel-id')) || getCurrentChannelId();
        addUnreadBadge(messageId, channelId);

        startAutoRemoveTimer(messageId, $message);
    }

    /**
     * 自動削除タイマーの開始
     */
    function startAutoRemoveTimer(messageId, $message) {
        if (STATE.autoRemoveTimers.has(messageId)) {
            clearTimeout(STATE.autoRemoveTimers.get(messageId));
        }

        const timer = setTimeout(() => {
            removeNewMark($message, messageId);
            STATE.autoRemoveTimers.delete(messageId);
        }, CONFIG.NEW_MARK_DURATION);

        STATE.autoRemoveTimers.set(messageId, timer);
    }

    /**
     * スクロール防止を有効化
     */
    function enableScrollPrevention() {
        if (STATE.scrollPreventionActive) return;
        
        STATE.scrollPreventionActive = true;
        debugLog('スクロール防止を有効化');
        
        const noOp = () => {};
        const noOpPromise = () => Promise.resolve();
        
        if (window.scrollToNewMessage && !window.originalScrollToNewMessage) {
            window.originalScrollToNewMessage = window.scrollToNewMessage;
            window.scrollToNewMessage = noOp;
        }
        
        if (window.LMSChat?.messages?.scrollManager?.scrollForNewMessage && !window.originalScrollForNewMessage) {
            window.originalScrollForNewMessage = window.LMSChat.messages.scrollManager.scrollForNewMessage;
            window.LMSChat.messages.scrollManager.scrollForNewMessage = noOpPromise;
        }
        
        if (window.scrollToBottom && !window.originalScrollToBottom) {
            window.originalScrollToBottom = window.scrollToBottom;
            window.scrollToBottom = noOp;
        }
        
        if (window.LMSChat?.messages?.scrollToBottom && !window.originalLMSScrollToBottom) {
            window.originalLMSScrollToBottom = window.LMSChat.messages.scrollToBottom;
            window.LMSChat.messages.scrollToBottom = noOp;
        }
        
        if (window.UnifiedScrollManager?.scrollToBottom && !window.originalUnifiedScrollToBottom) {
            window.originalUnifiedScrollToBottom = window.UnifiedScrollManager.scrollToBottom;
            window.UnifiedScrollManager.scrollToBottom = noOp;
        }
        
        if (window.UnifiedScrollManager?.scrollChatToBottom && !window.originalUnifiedScrollChatToBottom) {
            window.originalUnifiedScrollChatToBottom = window.UnifiedScrollManager.scrollChatToBottom;
            window.UnifiedScrollManager.scrollChatToBottom = noOp;
        }
        
        const originalAnimate = $.fn.animate;
        if (!window.originalJQueryAnimate) {
            window.originalJQueryAnimate = originalAnimate;
            $.fn.animate = function(properties, ...args) {
                if (properties && typeof properties === 'object' && 'scrollTop' in properties) {
                    debugLog('scrollTopアニメーションをブロックしました');
                    return this;
                }
                return originalAnimate.call(this, properties, ...args);
            };
        }
        
        const chatContainer = document.getElementById('chat-messages');
        if (chatContainer && !chatContainer._originalScrollTop) {
            chatContainer._originalScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') || 
                                              Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
            
            Object.defineProperty(chatContainer, 'scrollTop', {
                get: function() {
                    return chatContainer._originalScrollTop.get.call(this);
                },
                set: function(value) {
                    if (STATE.scrollPreventionActive) {
                        debugLog('scrollTop直接設定をブロックしました', { value });
                        return;
                    }
                    return chatContainer._originalScrollTop.set.call(this, value);
                },
                configurable: true
            });
        }
        
        setTimeout(() => {
            disableScrollPrevention();
        }, 1000);
    }
    
    /**
     * スクロール防止を無効化
     */
    function disableScrollPrevention() {
        if (!STATE.scrollPreventionActive) return;
        
        STATE.scrollPreventionActive = false;
        debugLog('スクロール防止を無効化');
        
        if (window.originalScrollToNewMessage) {
            window.scrollToNewMessage = window.originalScrollToNewMessage;
            window.originalScrollToNewMessage = null;
        }
        
        if (window.originalScrollForNewMessage && window.LMSChat?.messages?.scrollManager) {
            window.LMSChat.messages.scrollManager.scrollForNewMessage = window.originalScrollForNewMessage;
            window.originalScrollForNewMessage = null;
        }
        
        if (window.originalScrollToBottom) {
            window.scrollToBottom = window.originalScrollToBottom;
            window.originalScrollToBottom = null;
        }
        
        if (window.originalLMSScrollToBottom && window.LMSChat?.messages) {
            window.LMSChat.messages.scrollToBottom = window.originalLMSScrollToBottom;
            window.originalLMSScrollToBottom = null;
        }
        
        if (window.originalUnifiedScrollToBottom && window.UnifiedScrollManager) {
            window.UnifiedScrollManager.scrollToBottom = window.originalUnifiedScrollToBottom;
            window.originalUnifiedScrollToBottom = null;
        }
        
        if (window.originalUnifiedScrollChatToBottom && window.UnifiedScrollManager) {
            window.UnifiedScrollManager.scrollChatToBottom = window.originalUnifiedScrollChatToBottom;
            window.originalUnifiedScrollChatToBottom = null;
        }
        
        if (window.originalJQueryAnimate) {
            $.fn.animate = window.originalJQueryAnimate;
            window.originalJQueryAnimate = null;
        }
    }

    /**
     * Newマークを削除
     */
    function removeNewMark($message, messageId) {
        const $newMark = $message.find('.new-mark');
        if ($newMark.length > 0) {
            enableScrollPrevention();
            
            const channelId = parseInt($message.attr('data-channel-id')) || getCurrentChannelId();
            removeUnreadBadge(messageId, channelId);
            
            $newMark.fadeOut(300, function() {
                $(this).remove();
                debugLog(`メッセージ ${messageId} のNewマークを削除しました`);
            });

            STATE.markedMessages.delete(messageId);
        }
    }

    /**
     * 新規受信メッセージを処理
     */
    function processNewMessage(data) {
        if (!data || !data.payload) return;

        const messageId = data.payload.id || data.messageId;
        const userId = parseInt(data.payload.user_id);
        const currentUserId = getCurrentUserId();

        if (userId === currentUserId) {
            debugLog(`自分のメッセージのためスキップ: ${messageId}`);
            return;
        }

        debugLog(`新規メッセージを処理: ${messageId}`, {
            userId: userId,
            currentUserId: currentUserId,
            isNewFromServer: data.payload.isNewFromServer
        });

        let attempts = 0;
        const maxAttempts = 10;
        
        const tryAddNewMark = () => {
            attempts++;
            const $message = $(`.chat-message[data-message-id="${messageId}"]`);
            
            if ($message.length > 0) {
                addNewMark($message, messageId);
                debugLog(`Newマークを${attempts}回目で追加成功: ${messageId}`);
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(tryAddNewMark, 200 * attempts);
            } else {
                debugLog(`メッセージが見つかりません（${maxAttempts}回試行）: ${messageId}`);
            }
        };
        
        tryAddNewMark();
    }

    /**
     * 未読バッジを更新
     */
    function updateUnreadBadge(increment) {
        const $badges = $('.unread-badge:visible');
        $badges.each(function() {
            const $badge = $(this);
            const currentCount = parseInt($badge.text()) || 0;
            const newCount = Math.max(0, currentCount + increment);
            
            if (newCount > 0) {
                $badge.text(newCount).show();
            } else {
                $badge.hide();
            }
        });
    }

    /**
     * IntersectionObserverでメッセージの可視性を監視
     */
    function setupVisibilityObserver() {
        if (STATE.observer) {
            STATE.observer.disconnect();
        }

        STATE.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const $message = $(entry.target);
                const messageId = $message.attr('data-message-id');
                
                if (entry.isIntersecting && entry.intersectionRatio >= CONFIG.VISIBILITY_THRESHOLD) {
                    if (!$message.hasClass('viewed-once')) {
                        $message.addClass('viewed-once');
                        
                        const $newMark = $message.find('.new-mark');
                        if ($newMark.length > 0) {
                            updateUnreadBadge(-1);
                        }
                    }
                } else if (!entry.isIntersecting && $message.hasClass('viewed-once')) {
                    removeNewMark($message, messageId);
                    $message.addClass('read-completely');
                }
            });
        }, {
            root: $('#chat-messages')[0],
            threshold: [0, CONFIG.VISIBILITY_THRESHOLD, 1]
        });

        observeExistingMessages();
    }

    /**
     * 既存のメッセージを監視対象に追加
     */
    function observeExistingMessages() {
        $('.chat-message').each(function() {
            const $message = $(this);
            const userId = $message.attr('data-user-id');
            const currentUserId = getCurrentUserId();
            
            if (parseInt(userId) === currentUserId) {
                return;
            }
            
            if (STATE.observer) {
                STATE.observer.observe(this);
            }
        });
    }

    /**
     * DOMの変更を監視
     */
    function setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && $(node).hasClass('chat-message')) {
                        const $message = $(node);
                        const userId = $message.attr('data-user-id');
                        const currentUserId = getCurrentUserId();
                        
                        if (parseInt(userId) !== currentUserId) {
                            if (STATE.observer) {
                                STATE.observer.observe(node);
                            }
                        }
                    }
                });
            });
        });

        const container = document.getElementById('chat-messages');
        if (container) {
            observer.observe(container, {
                childList: true,
                subtree: true
            });
        }
    }

    /**
     * 初期化
     */
    function init() {
        if (STATE.initialized) return;

        debugLog('New Message Marker System 初期化開始');

        $(document).off('lms_longpoll_new_message.newmark')
                  .on('lms_longpoll_new_message.newmark', function(e, data) {
                      debugLog('lms_longpoll_new_message イベント受信', data);
                      processNewMessage(data);
                  });

        $(document).off('lms_new_message_received.newmark')
                  .on('lms_new_message_received.newmark', function(e, data) {
                      debugLog('lms_new_message_received イベント受信', data);
                      if (data && data.message) {
                          processNewMessage({
                              payload: data.message,
                              messageId: data.message.id
                          });
                      }
                  });

        $(document).off('messages:displayed.newmark')
                  .on('messages:displayed.newmark', function(e, messages, isNewMessages) {
                      // 🔥 SCROLL FLICKER FIX: チャンネル切り替え中はDOM更新をスキップ
                      if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.isChannelSwitching) {
                          return;
                      }
                      
                      if (isNewMessages && messages) {
                          debugLog('新規メッセージ表示イベント', { messageCount: messages.length });
                          messages.forEach(message => {
                              const userId = parseInt(message.user_id);
                              const currentUserId = getCurrentUserId();
                              
                              if (userId !== currentUserId && (message.is_new || message.isNewFromServer)) {
                                  processNewMessage({
                                      payload: message,
                                      messageId: message.id
                                  });
                              }
                          });
                      }
                  });

        setupVisibilityObserver();
        setupMutationObserver();

        setInterval(() => {
            observeExistingMessages();
        }, CONFIG.CHECK_INTERVAL);

        STATE.initialized = true;
        debugLog('New Message Marker System 初期化完了');
    }

    window.LMSNewMessageMarker = {
        init: init,
        addNewMark: addNewMark,
        removeNewMark: removeNewMark,
        getState: () => STATE,
        getConfig: () => CONFIG
    };

    $(document).ready(function() {
        setTimeout(() => {
            init();
        }, 1000);
    });

})(jQuery);