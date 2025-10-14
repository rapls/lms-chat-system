(function() {
    'use strict';
    class DirectThreadLoader {
        constructor() {
            this.config = {
                timeout: 45000,
                maxRetries: 3,
                retryDelay: 500,
            };
            this.state = {
                activeLoads: new Map(),
                loadHistory: new Map(),
                isEnabled: true,
                globalLock: new Map(),
                sessionId: Date.now() + '_' + Math.random(),
                forceReload: false
            };
            this.init();
        }
        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.setupDirectThreadLoader();
                });
            } else {
                this.setupDirectThreadLoader();
            }
            window.LMSDirectThreadLoader = this;
        }
        setupDirectThreadLoader() {
            this.backupOriginalFunctions();
            this.createDirectLoadFunction();
            this.overrideOpenThreadFunction();
            this.setupThreadClickHandlers();
            this.setupUIMonitoring();
        }
        backupOriginalFunctions() {
            if (window.loadThreadMessages && typeof window.loadThreadMessages === 'function') {
                this.originalLoadThreadMessages = window.loadThreadMessages;
            }
            if (window.LMSChat && window.LMSChat.threads && 
                typeof window.LMSChat.threads.loadThreadMessages === 'function') {
                this.originalLMSChatLoadThreadMessages = window.LMSChat.threads.loadThreadMessages;
            }
        }
        createDirectLoadFunction() {
            const directLoader = this;
            window.loadThreadMessages = async (messageId, page = 1, preserveScroll = false) => {
                if (!window.lmsChat || !window.lmsChat.ajaxUrl) {
                    return;
                }
                try {
                    const result = await directLoader.loadThreadDirectly(messageId, page, preserveScroll);
                    return result;
                } catch (error) {
                    throw error;
                }
            };
            if (window.LMSChat) {
                if (!window.LMSChat.threads) window.LMSChat.threads = {};
                window.LMSChat.threads.loadThreadMessages = window.loadThreadMessages;
            }
            const setupFunction = () => {
                window.loadThreadMessages = async (messageId, page = 1, preserveScroll = false) => {
                    try {
                        const result = await directLoader.loadThreadDirectly(messageId, page, preserveScroll);
                        return result;
                    } catch (error) {
                        throw error;
                    }
                };
                if (window.LMSChat && window.LMSChat.threads) {
                    window.LMSChat.threads.loadThreadMessages = window.loadThreadMessages;
                }
            };
            setTimeout(setupFunction, 100);
            setTimeout(setupFunction, 500);
            setTimeout(setupFunction, 1000);
            setTimeout(setupFunction, 2000);
            setTimeout(setupFunction, 3000);
            setTimeout(() => {
                if (window.LMSChat && window.LMSChat.threads) {
                }
            }, 3500);
        }
        overrideOpenThreadFunction() {
            if (window.openThread && typeof window.openThread === 'function') {
                this.originalOpenThread = window.openThread;
            }
            const self = this;
            const directOpenThread = async (messageId) => {
                if (typeof messageId === 'string' && (messageId.startsWith('temp_') || messageId.includes('temp_'))) {
                    if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.tempToRealMessageMap) {
                        const realMessageId = window.LMSChat.state.tempToRealMessageMap.get(messageId);
                        if (realMessageId) {
                            messageId = realMessageId;
                        } else {
                            if (window.LMSChat && window.LMSChat.utils && window.LMSChat.utils.showError) {
                                window.LMSChat.utils.showError('メッセージの送信が完了するまでお待ちください');
                            }
                            return;
                        }
                    } else {
                        if (window.LMSChat && window.LMSChat.utils && window.LMSChat.utils.showError) {
                            window.LMSChat.utils.showError('メッセージの送信が完了するまでお待ちください');
                        }
                        return;
                    }
                }
                const numericMessageId = parseInt(messageId, 10);
                if (isNaN(numericMessageId) || numericMessageId <= 0) {
                    return;
                }
                self.showThreadPanel(numericMessageId);
                try {
                    await self.loadThreadDirectly(numericMessageId, 1, false);
                } catch (error) {
                }
            };
            window.openThread = directOpenThread;
            let overrideCount = 0;
            const maxOverrides = 10;
            const protectOpenThread = setInterval(() => {
                if (window.openThread !== directOpenThread && overrideCount < maxOverrides) {
                    overrideCount++;
                    if (overrideCount <= 3) {
                    }
                    window.openThread = async (messageId) => {
                        return await directOpenThread(messageId);
                    };
                }
                if (overrideCount >= maxOverrides) {
                    clearInterval(protectOpenThread);
                }
            }, 200);
            setTimeout(() => {
                clearInterval(protectOpenThread);
            }, 3000);
            if (window.LMSChat && window.LMSChat.threads) {
                window.LMSChat.threads.openThread = window.openThread;
            }
        }
        setupThreadClickHandlers() {
            $(document).on('click', '.thread-toggle, .thread-info, .thread-count, .thread-button', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const $message = $(e.currentTarget).closest('.chat-message');
                const messageId = $message.data('message-id');
                if (messageId) {
                    setTimeout(() => {
                        window.openThread(messageId);
                    }, 0);
                } else {
                }
            });
            $(document).on('click', '[data-action="open-thread"]', (e) => {
                e.preventDefault();
                const messageId = $(e.currentTarget).data('message-id');
                if (messageId) {
                    setTimeout(() => {
                        window.openThread(messageId);
                    }, 0);
                }
            });
        }
        showThreadPanel(messageId) {
            let $threadPanel = $('#thread-panel, .thread-panel, .thread-view, .sidebar-right');
            if ($threadPanel.length === 0) {
                const threadPanelHtml = `
                    <div id="thread-panel" class="thread-panel show open">
                        <div class="thread-header">
                            <h3>スレッド</h3>
                            <button class="close-thread-btn">&times;</button>
                        </div>
                        <div class="parent-message"></div>
                        <div class="thread-messages"></div>
                        <div class="thread-input-container">
                            <form class="thread-form">
                                <textarea class="thread-input" placeholder="返信を入力..."></textarea>
                                <button type="submit" class="thread-send-btn">送信</button>
                            </form>
                        </div>
                    </div>
                `;
                $('body').append(threadPanelHtml);
                $threadPanel = $('#thread-panel');
                $threadPanel.find('.close-thread-btn').on('click', () => {
                    $threadPanel.hide().removeClass('show open');
                });
            } else {
                $threadPanel.show().addClass('show open');
                $threadPanel.css({
                    'right': '0',
                    'opacity': '1', 
                    'visibility': 'visible',
                    'transform': 'translateX(0)',
                    'display': 'block'
                });
            }
            const $message = $(`.chat-message[data-message-id="${messageId}"]`);
            if ($message.length > 0) {
                const displayName = $message.find('.user-name').text().trim();
                const messageTime = $message.find('.message-time').text().trim();
                const messageText = $message.find('.message-text').html();
                const parentReactions = $message.find('.message-reactions').html() || '';
                const isCurrentUser = $message.hasClass('current-user');
                $('.parent-message').html(`
                    <div class="parent-message-header">
                        <div class="message-header-left">
                            <span class="message-time">${messageTime}</span>
                            <span class="user-name">${displayName}</span>
                        </div>
                        <div class="header-actions">
                            <div class="message-actions">
                                <button class="action-button add-reaction" aria-label="リアクションを追加" data-message-id="${messageId}">
                                    <img src="/wp-content/themes/lms/img/icon-emoji.svg" alt="絵文字" width="20" height="20">
                                </button>
                                ${isCurrentUser ? `
                                <button class="action-button delete-parent-message" aria-label="メッセージを削除" data-message-id="${messageId}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                        <div class="close-thread-btn" title="スレッドを閉じる">&times;</div>
                    </div>
                    <div class="parent-message-body">
                        <div class="message-content">
                            <div class="message-text">${messageText}</div>
                        </div>
                    </div>
                `).attr('data-message-id', messageId).addClass(isCurrentUser ? 'current-user' : '');
                if (parentReactions) {
                    $('.parent-message-reactions').remove();
                    $(
                        '<div class="parent-message-reactions" data-message-id="' +
                            messageId +
                            '">' +
                            parentReactions +
                            '</div>'
                    ).insertAfter('.parent-message');
                } else {
                    $('.parent-message-reactions').remove();
                }
                setTimeout(() => {
                    if (window.LMSChat.reactionActions && window.LMSChat.reactionActions.refreshParentMessageReactions) {
                        window.LMSChat.reactionActions.refreshParentMessageReactions(messageId, true);
                    }
                }, 100);
            }
            if (window.LMSChat && window.LMSChat.state) {
                window.LMSChat.state.currentThread = messageId;
            }
            const $threadMessages = $('.thread-messages');
            if ($threadMessages.length > 0) {
                $threadMessages.html('<div class="loading-indicator">メッセージを読み込み中...</div>');
            }
        }
        async loadThreadDirectly(messageId, page = 1, preserveScroll = false) {
            const loadKey = `${messageId}_${page}`;
            const globalLockKey = `thread_${messageId}`;
            const currentLock = window.LMSThreadLocks ? window.LMSThreadLocks.get(globalLockKey) : null;
            if (currentLock && currentLock !== this.state.sessionId) {
                await this.delay(200);
            }
            if (!window.LMSThreadLocks) {
                window.LMSThreadLocks = new Map();
            }
            window.LMSThreadLocks.set(globalLockKey, this.state.sessionId);
            if (this.state.activeLoads.has(loadKey) && !this.state.forceReload) {
                return await this.state.activeLoads.get(loadKey);
            }
            this.state.forceReload = false;
            const loadPromise = this.executeDirectLoad(messageId, page, preserveScroll);
            this.state.activeLoads.set(loadKey, loadPromise);
            try {
                const result = await loadPromise;
                this.state.activeLoads.delete(loadKey);
                window.LMSThreadLocks.delete(globalLockKey);
                this.recordLoadHistory(messageId, true);
                return result;
            } catch (error) {
                this.state.activeLoads.delete(loadKey);
                window.LMSThreadLocks.delete(globalLockKey);
                this.recordLoadHistory(messageId, false, error);
                throw error;
            }
        }
        async executeDirectLoad(messageId, page, preserveScroll) {
            this.prepareThreadUI(messageId);
            for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
                try {
                    if (attempt > 1) {
                        const randomDelay = Math.random() * 200;
                        await this.delay(randomDelay);
                    }
                    const result = await this.performAjaxRequest(messageId, page, attempt);
                    if (!result || !result.success) {
                        throw new Error('Invalid response structure');
                    }
                    this.displayThreadMessages(result, preserveScroll);
                    await this.delay(50);
                    return result;
                } catch (error) {
                    if (attempt < this.config.maxRetries) {
                        const backoffDelay = this.config.retryDelay * Math.pow(2, attempt - 1);
                        await this.delay(backoffDelay);
                        this.resetThreadUI(messageId);
                    } else {
                        this.displayThreadError(messageId, error);
                        throw error;
                    }
                }
            }
        }
        prepareThreadUI(messageId) {
            const $threadMessages = $('.thread-messages');
            $threadMessages.empty();
            $('.thread-loading-subtle').remove();
            $('.loading-indicator').remove();
            $('.thread-loading').remove();
            $threadMessages.html(`
                <div class="loading-indicator">
                    <div class="spinner"></div>
                    <p>メッセージを読み込んでいます...</p>
                </div>
            `);
        }
        resetThreadUI(messageId) {
            const $threadMessages = $('.thread-messages');
            $threadMessages.find('.loading-indicator p').text('再試行中...');
        }
        async performAjaxRequest(messageId, page, attempt) {
            return new Promise((resolve, reject) => {
                const timeout = this.config.timeout + (attempt - 1) * 5000;
                const ajax = $.ajax({
                    url: window.lmsChat.ajaxUrl,
                    type: 'GET',
                    dataType: 'json',
                    data: {
                        action: 'lms_get_thread_messages',
                        parent_message_id: messageId,
                        page: page,
                        nonce: window.lmsChat.nonce,
                        _: Date.now()
                    },
                    timeout: timeout,
                    cache: false,
                    success: (response) => {
                        if (response && response.success && response.data) {
                            resolve(response);
                        } else {
                            reject(new Error('Invalid response format: ' + JSON.stringify(response)));
                        }
                    },
                    error: (xhr, status, error) => {
                        let errorMessage = `Ajax error: ${status}`;
                        if (error) errorMessage += ` - ${error}`;
                        if (xhr.status) errorMessage += ` (HTTP ${xhr.status})`;
                        if (status === 'timeout') {
                            errorMessage += ` (after ${timeout}ms)`;
                        }
                        if (xhr.responseText) {
                            try {
                                const errorResponse = JSON.parse(xhr.responseText);
                                if (errorResponse.data) {
                                    errorMessage += ` - ${errorResponse.data}`;
                                }
                            } catch (e) {
                            }
                        }
                        reject(new Error(errorMessage));
                    }
                });
            });
        }
        displayThreadMessages(response, preserveScroll) {
            const $threadMessages = $('.thread-messages');
            if (!response || !response.data) {
                $threadMessages.html('<div class="thread-error">メッセージの表示に失敗しました</div>');
                return;
            }
            const messages = response.data.messages || [];
            $threadMessages.empty();
            if (messages.length > 0) {
                const beforeCount = $threadMessages.find('.thread-message').length;
                messages.forEach((message, index) => {
                    try {
                        if (message.deleted_at) {
                            return;
                        }
                        let messageHtml;
                        if (typeof window.createThreadMessageHtml === 'function') {
                            messageHtml = window.createThreadMessageHtml(message);
                        } else if (window.LMSChat && window.LMSChat.threads && typeof window.LMSChat.threads.createThreadMessageHtml === 'function') {
                            messageHtml = window.LMSChat.threads.createThreadMessageHtml(message);
                        } else {
                            messageHtml = this.createMessageHTML(message);
                        }
                        if (messageHtml && messageHtml.trim()) {
                            const beforeAppend = $threadMessages.find('.thread-message').length;
                            $threadMessages.append(messageHtml);
                            const afterAppend = $threadMessages.find('.thread-message').length;
                        } else {
                        }
                    } catch (e) {
                        $threadMessages.append(`<div class="thread-message error">メッセージ ${message.id} の表示に失敗しました</div>`);
                    }
                });
                const afterCount = $threadMessages.find('.thread-message').length;
                setTimeout(() => {
                    const visibleMessages = $threadMessages.find('.thread-message:visible').length;
                    const hiddenMessages = $threadMessages.find('.thread-message:hidden').length;
                    const threadContainer = $threadMessages[0];
                    if (threadContainer) {
                    }
                    $threadMessages.find('.thread-message').each(function(index) {
                        const $msg = $(this);
                        const display = $msg.css('display');
                        const visibility = $msg.css('visibility');
                        const opacity = $msg.css('opacity');
                        const messageId = $msg.data('message-id');
                        const position = $msg.position();
                        const offset = $msg.offset();
                        const height = $msg.outerHeight();
                        if (display === 'none' || visibility === 'hidden' || opacity === '0') {
                        }
                    });
                    const allThreadMessages = $('.thread-message');
                    const messageIds = [];
                    const duplicates = [];
                    allThreadMessages.each(function() {
                        const messageId = $(this).data('message-id');
                        if (messageIds.includes(messageId)) {
                            duplicates.push(messageId);
                        } else {
                            messageIds.push(messageId);
                        }
                    });
                    if (duplicates.length > 0) {
                    }
                }, 100);
                if (!preserveScroll) {
                    if (window.UnifiedScrollManager) {
                        setTimeout(() => {
                            window.UnifiedScrollManager.scrollThreadToBottom(100, true);
                        }, 100);
                        setTimeout(() => {
                            window.UnifiedScrollManager.scrollThreadToBottom(0, false);
                        }, 300);
                    } else {
                        setTimeout(() => {
                            if ($threadMessages[0]) {
                                const scrollElement = $threadMessages[0];
                                scrollElement.scrollTop = scrollElement.scrollHeight;
                            }
                        }, 100);
                        setTimeout(() => {
                            if ($threadMessages[0]) {
                                $threadMessages[0].scrollTop = $threadMessages[0].scrollHeight;
                            }
                        }, 300);
                    }
                }
            } else {
                $threadMessages.html('<div class="no-messages">このスレッドにはまだ返信がありません</div>');
            }
        }
		createMessageHTML(message) {
			const isCurrentUser = Number(message.user_id) === Number(window.lmsChat.currentUserId);
			const avatarUrl = message.avatar_url || '/wp-content/themes/lms/img/default-avatar.png';
			const displayName = message.display_name || message.user_name || 'ユーザー';
			const messageText = message.message || '';
			const formattedTime = message.formatted_time || '';
			const canRenderReactions =
				message.reactions &&
				message.reactions.length > 0 &&
				window.LMSChat &&
				window.LMSChat.reactions &&
				typeof window.LMSChat.reactions.createReactionsHtml === 'function';
			let reactionsHtml = '';
			if (canRenderReactions) {
				try {
					reactionsHtml = window.LMSChat.reactions.createReactionsHtml(message.reactions) || '';
					if (reactionsHtml && !reactionsHtml.includes('data-reactions-hydrated')) {
						reactionsHtml = reactionsHtml.replace(
							/<div class="message-reactions([^>]*)>/,
							'<div class="message-reactions$1" data-reactions-hydrated="1">'
						);
					}
				} catch (error) {
					reactionsHtml = '';
				}
			}
			if (!reactionsHtml) {
				reactionsHtml = '<div class="message-reactions" data-reactions-hydrated="0"></div>';
			}
			return `
				<div class="thread-message ${isCurrentUser ? 'current-user' : ''}" data-message-id="${message.id}">
					<div class="thread-message-avatar">
						<img src="${avatarUrl}" alt="${displayName}" width="32" height="32">
					</div>
                    <div class="thread-message-content">
                        <div class="thread-message-header">
                            <span class="thread-message-user ${isCurrentUser ? 'current-user-name' : ''}">${displayName}</span>
                            <span class="thread-message-time">${formattedTime}</span>
                        </div>
						<div class="thread-message-text">${messageText}</div>
					</div>
					${reactionsHtml}
					<div class="message-actions">
						<button class="add-reaction" title="リアクションを追加">😀</button>
						<button class="delete-thread-message" title="削除">🗑️</button>
					</div>
				</div>
            `;
        }
        displayThreadError(messageId, error) {
            const $threadMessages = $('.thread-messages');
            let errorDetail = error.message || 'Unknown error';
            if (error.message.includes('timeout')) {
                errorDetail = 'タイムアウト: サーバーからの応答がありません';
            } else if (error.message.includes('404')) {
                errorDetail = 'スレッドが見つかりません';
            } else if (error.message.includes('500')) {
                errorDetail = 'サーバーエラーが発生しました';
            }
            $threadMessages.html(`
                <div class="thread-error-direct">
                    <p>スレッドの読み込みに失敗しました</p>
                    <p class="error-details">${errorDetail}</p>
                    <button onclick="window.loadThreadMessages('${messageId}')" class="retry-button">
                        再試行
                    </button>
                </div>
            `);
        }
        setupUIMonitoring() {
            setInterval(() => {
                const $loading = $('.loading-indicator');
                if ($loading.length > 0) {
                    const loadingTime = Date.now() - ($loading.data('start-time') || Date.now());
                    if (loadingTime > 20000) {
                        $loading.find('p').html('読み込みが長時間続いています...<br><small>ページをリロードしてください</small>');
                    }
                } else {
                    $('.loading-indicator').data('start-time', Date.now());
                }
            }, 5000);
        }
        recordLoadHistory(messageId, success, error = null) {
            const record = {
                timestamp: Date.now(),
                success: success,
                error: error ? error.message : null
            };
            if (!this.state.loadHistory.has(messageId)) {
                this.state.loadHistory.set(messageId, []);
            }
            const history = this.state.loadHistory.get(messageId);
            history.push(record);
            if (history.length > 10) {
                history.splice(0, history.length - 10);
            }
        }
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        getLoadHistory(messageId) {
            return this.state.loadHistory.get(messageId) || [];
        }
        getStatus() {
            return {
                enabled: this.state.isEnabled,
                activeLoads: this.state.activeLoads.size,
                totalHistory: Array.from(this.state.loadHistory.values()).flat().length
            };
        }
        enable() {
            this.state.isEnabled = true;
        }
        disable() {
            this.state.isEnabled = false;
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                new DirectThreadLoader();
            }, 500);
        });
    } else {
        setTimeout(() => {
            new DirectThreadLoader();
        }, 500);
    }
    window.getDirectThreadLoaderStatus = () => {
        if (window.LMSDirectThreadLoader) {
            return window.LMSDirectThreadLoader.getStatus();
        }
        return null;
    };
    window.forceThreadReload = (messageId) => {
        if (window.loadThreadMessages && window.LMSDirectThreadLoader) {
            if (window.LMSThreadLocks) {
                window.LMSThreadLocks.delete(`thread_${messageId}`);
            }
            if (window.LMSDirectThreadLoader.state) {
                window.LMSDirectThreadLoader.state.activeLoads.clear();
                window.LMSDirectThreadLoader.state.forceReload = true;
            }
            return window.loadThreadMessages(messageId, 1, false);
        }
    };
    window.clearThreadLoadingState = () => {
        if (window.LMSThreadLocks) {
            window.LMSThreadLocks.clear();
        }
        if (window.LMSDirectThreadLoader && window.LMSDirectThreadLoader.state) {
            window.LMSDirectThreadLoader.state.activeLoads.clear();
        }
        const $threadMessages = $('.thread-messages');
        if ($threadMessages.length > 0) {
            $threadMessages.empty();
        }
    };
})();
