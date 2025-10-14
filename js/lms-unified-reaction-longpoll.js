/**
 * LMS 統合リアクション・Long Pollingシステム
 * 
 * リアクション処理とLong Pollingを完全統合し、
 * 競合を解消して効率的な同期を実現
 * 
 * @version 1.0.0
 * @since 2025-09-13
 */

(function($) {
    'use strict';

    /**
     * 統合リアクション・Long Pollingマネージャー
     */
    class UnifiedReactionLongPoll {
        constructor() {
            // 基本設定
            this.isActive = false;
            this.pollTimeout = null;
            this.pollInterval = 30000; // 30秒
            this.shortPollInterval = 1000; // 1秒（リアクション直後）
            
            // リアクション状態管理
            this.reactionState = new Map();
            this.pendingReactions = new Map();
            this.processingReactions = new Set();
            
            // Long Polling状態
            this.lastEventId = 0;
            this.lastTimestamp = Math.floor(Date.now() / 1000);
            this.lastMessageId = 0;
            this.sequenceNumber = 0;
            this.retryCount = 0;
            this.maxRetries = 3;
            
            // 設定の取得
            this.config = this.getConfig();
            
            // デバッグモード
            this.debug = true;
            
            // 初期化
            this.init();
        }

        /**
         * 初期化
         */
        init() {
            this.log('🚀 統合リアクション・Long Pollingシステム起動');
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            // 既存のリアクション読み込み
            this.loadExistingReactions();
            
            // 既存のリアクション表示を統合システムで再構築
            this.rebuildExistingReactions();
            
            // DOMが完全に準備された後に現在ユーザーのリアクションを修正
            setTimeout(() => {
                this.fixCurrentUserReactions();
            }, 100);
            
            // 緊急修正: 既存のリアクションを即座に修正
            this.emergencyFixReactions();
            
            // Long Polling開始は初期ハイドレーション完了後に実行
            this.ensureInitialHydration()
                .catch((error) => {
                    this.log('⚠️ 初期リアクション同期に失敗', error);
                })
                .finally(() => {
                    this.startPolling();
                });
        }

        /**
         * 設定の取得
         */
        getConfig() {
            const config = {
                ajaxUrl: window.lmsChat?.ajaxUrl || 
                        window.ajax_object?.ajax_url || 
                        '/wp-admin/admin-ajax.php',
                nonce: window.lmsLongPollConfig?.nonce || 
                      window.lmsChat?.nonce || 
                      window.ajax_object?.nonce || '',
                nonceAction: window.lmsLongPollConfig?.nonce_action || 
                            'lms_ajax_nonce',
                userId: window.lmsChat?.currentUserId || 
                       window.lmsChat?.state?.currentUserId || 0,
                channelId: window.LMSChat?.state?.currentChannel || 1
            };
            
            return config;
            
            return config;
        }

        /**
         * イベントリスナー設定
         */
        setupEventListeners() {
            // リアクションクリック
            $(document).on('click', '.reaction-item, .add-reaction-btn', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleReactionClick(e);
            });

            // チャンネル切り替え
            $(document).on('channel:switched', (e, data) => {
                this.config.channelId = data.channelId;
                this.resetPolling();
            });

            // ページ可視性変更
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.pausePolling();
                } else {
                    this.resumePolling();
                }
            });
        }

        ensureInitialHydration() {
            const messageNodes = Array.from(document.querySelectorAll('.chat-message[data-message-id]')) || [];
            const visibleMessageIds = messageNodes
                .map((node) => node?.dataset?.messageId)
                .filter(Boolean);

            if (visibleMessageIds.length === 0) {
                return Promise.resolve();
            }

            const uncachedIds = visibleMessageIds.filter((id) => !this.reactionState.has(id));
            if (uncachedIds.length === 0) {
                return Promise.resolve();
            }

            const chunkSize = 5;
            const batches = [];
            for (let i = 0; i < uncachedIds.length; i += chunkSize) {
                batches.push(this.fetchReactionBatch(uncachedIds.slice(i, i + chunkSize)));
            }

            return Promise.allSettled(batches).then(() => undefined);
        }

        async fetchReactionBatch(messageIds) {
            if (!Array.isArray(messageIds) || messageIds.length === 0) {
                return;
            }

            try {
                const response = await $.ajax({
                    url: this.config.ajaxUrl,
                    type: 'GET',
                    data: {
                        action: 'lms_get_reactions',
                        message_ids: messageIds.join(','),
                        nonce: this.config.nonce,
                        _: Date.now(),
                    },
                    timeout: 10000,
                    cache: false,
                });

                if (response?.success && response.data) {
                    Object.entries(response.data).forEach(([messageId, reactions]) => {
                        const normalizedReactions = Array.isArray(reactions) ? reactions : (reactions || []);
                        this.reactionState.set(messageId, normalizedReactions);
                        this.updateReactionUI(messageId, normalizedReactions);
                    });
                } else {
                    this.log('ℹ️ 初期リアクション取得: 応答にデータがありません', { messageIds, response });
                }
            } catch (error) {
                this.log('⚠️ 初期リアクション取得エラー', { messageIds, error });
            }
        }

        /**
         * リアクションクリック処理
         */
        async handleReactionClick(e) {
            
            const $target = $(e.currentTarget);
            const $message = $target.closest('.chat-message');
            const messageId = $message.data('message-id');
            const messageUserId = $message.data('user-id');
            const emoji = $target.data('emoji') || $target.find('.emoji').text() || $target.text().trim();
            let isOwn = $target.hasClass('own-reaction');
            
            // 現在ユーザーのメッセージのリアクションかチェック
            const isCurrentUserMessage = 
                String(messageUserId) === String(this.config.userId) ||
                $message.hasClass('current-user');
            
            if (isCurrentUserMessage && !isOwn) {
                $target.addClass('own-reaction');
                isOwn = true;
            }
            
            this.log('🎯 リアクションクリック詳細:', {
                messageId, 
                emoji, 
                isOwn, 
                target: $target[0],
                targetClasses: $target.attr('class')
            });
            
            if (!messageId || !emoji) {
                this.log('❌ リアクション情報が不完全:', { messageId, emoji });
                return;
            }

            // 処理中チェック
            const actionKey = `${messageId}:${emoji}`;
            if (this.processingReactions.has(actionKey)) {
                this.log('⏳ 処理中のためスキップ:', actionKey);
                return;
            }

            this.processingReactions.add(actionKey);

            try {
                // 楽観的UI更新
                this.optimisticUpdate(messageId, emoji, !isOwn);
                
                // サーバー送信（Long Pollingと統合）
                const result = await this.sendReaction(messageId, emoji, isOwn ? 'remove' : 'add');
                
                if (result.success) {
                    // 成功時は即座にポーリング
                    this.triggerImmediatePolling();
                } else {
                    // 失敗時はロールバック
                    this.rollbackOptimisticUpdate(messageId, emoji, isOwn);
                    this.showError('リアクション処理に失敗しました');
                }
            } finally {
                this.processingReactions.delete(actionKey);
            }
        }

        /**
         * リアクション送信（Long Polling統合）
         */
        async sendReaction(messageId, emoji, action) {
            this.log('📤 リアクション送信:', { messageId, emoji, action });
            
            // Long Pollingを一時的に高速化
            this.enterFastPollingMode();
            
            try {
                const response = await $.ajax({
                    url: this.config.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'lms_toggle_reaction',  // 既存のリアクションエンドポイントを使用
                        message_id: messageId,
                        emoji: emoji,
                        is_removing: action === 'remove' ? 1 : 0,
                        nonce: this.config.nonce
                    },
                    timeout: 15000 // 15秒に延長
                });

                if (response.success) {
                    // 新しいイベントがあれば即座に処理
                    if (response.events && response.events.length > 0) {
                        this.processEvents(response.events);
                    }
                    
                    // 最新のタイムスタンプを更新
                    if (response.timestamp) {
                        this.lastTimestamp = response.timestamp;
                    }
                }

                return response;
            } catch (error) {
                this.log('❌ リアクション送信エラー:', error);
                return { success: false, error: error };
            }
        }

        /**
         * Long Polling処理
         */
        async startPolling() {
            if (!this.isActive) {
                this.isActive = true;
                this.poll();
            }
        }

        /**
         * ポーリング実行
         */
        async poll() {
            if (!this.isActive) return;

            try {
                const response = await $.ajax({
                    url: this.config.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'lms_chat_poll',  // 正常動作している統合エンドポイントを使用
                        channel_id: this.config.channelId,
                        last_message_id: this.lastMessageId || 0,
                        last_thread_message_id: 0,
                        last_reaction_timestamp: this.lastTimestamp,
                        current_thread_id: 0,
                        tab_id: 'unified_reaction_' + Date.now(),
                        sequence: this.sequenceNumber++,
                        nonce: this.config.nonce
                    },
                    timeout: this.pollInterval
                });

                if (response.success) {
                    // lms_chat_pollレスポンス形式に対応
                    this.processChatPollResponse(response.data);
                    this.retryCount = 0;
                }

                // 次のポーリング
                this.scheduleNextPoll();

            } catch (error) {
                if (error.statusText !== 'timeout') {
                    this.log('⚠️ ポーリングエラー:', error);
                    this.handlePollError();
                } else {
                    // タイムアウトは正常（Long Polling）
                    this.scheduleNextPoll();
                }
            }
        }

        /**
         * lms_chat_pollレスポンス処理
         */
        processChatPollResponse(data) {
            if (!data) return;
            
            this.log('📋 Chat Poll レスポンス処理:', data);
            
            // リアクション更新を処理
            if (data.reaction_updates && Array.isArray(data.reaction_updates)) {
                data.reaction_updates.forEach(update => {
                    this.handleReactionUpdate(update);
                });
            }
            
            // 最新のメッセージIDを更新
            if (data.new_messages && Array.isArray(data.new_messages) && data.new_messages.length > 0) {
                const lastMessage = data.new_messages[data.new_messages.length - 1];
                if (lastMessage.id && lastMessage.id > this.lastMessageId) {
                    this.lastMessageId = parseInt(lastMessage.id);
                }
            }
            
            // 未読カウントを更新
            if (data.unread_counts) {
                this.handleUnreadCountUpdate(data.unread_counts);
            }
            
            // タイムスタンプを更新
            this.lastTimestamp = Math.floor(Date.now() / 1000);
        }

        /**
         * イベント処理
         */
        processEvents(events) {
            if (!Array.isArray(events)) return;

            events.forEach(event => {
                this.log('📨 イベント処理:', event);

                // イベントIDを更新
                if (event.id && event.id > this.lastEventId) {
                    this.lastEventId = event.id;
                }

                // イベントタイプ別処理
                switch (event.type) {
                    case 'reaction_update':
                        this.handleReactionUpdate(event);
                        break;
                    case 'message_create':
                        this.handleMessageCreate(event);
                        break;
                    case 'message_delete':
                        this.handleMessageDelete(event);
                        break;
                    default:
                        // その他のイベントは既存システムに委譲
                        $(document).trigger(`lms:${event.type}`, event);
                }
            });
        }

        /**
         * リアクション更新処理
         */
        handleReactionUpdate(event) {
            const { message_id, reactions, user_id } = event.data || {};
            
            if (!message_id) return;

            // 自分の操作は既に楽観的更新済みなのでスキップ
            if (user_id === this.config.userId && 
                this.pendingReactions.has(message_id)) {
                this.pendingReactions.delete(message_id);
                return;
            }

            // UIを更新
            this.updateReactionUI(message_id, reactions || []);
            
            // 状態を保存
            this.reactionState.set(message_id, reactions || []);
            
            // イベント発火
            $(document).trigger('reaction:updated', {
                messageId: message_id,
                reactions: reactions,
                source: 'longpoll'
            });
        }

        /**
         * リアクションUI更新
         */
        updateReactionUI(messageId, reactions) {
            const $message = $(`.chat-message[data-message-id="${messageId}"]`);
            if ($message.length === 0) return;

            const $container = $message.find('.message-reactions');
            if ($container.length === 0) return;

            // リアクションをグループ化
            const reactionGroups = this.groupReactions(reactions);
            
            // UI構築
            let html = '';
            Object.entries(reactionGroups).forEach(([emoji, users]) => {
                // デバッグ: ユーザーID比較
                this.log('🔍 ユーザーID比較詳細:', {
                    emoji,
                    users,
                    currentUserId: this.config.userId,
                    currentUserIdType: typeof this.config.userId,
                    usersTypes: users.map(u => typeof u),
                    includes_raw: users.includes(this.config.userId),
                    includes_string: users.includes(String(this.config.userId)),
                    includes_number: users.includes(Number(this.config.userId))
                });
                
                // 型安全な比較: 文字列と数値の両方をチェック
                const currentUserId = this.config.userId;
                const isOwn = users.some(u => 
                    u === currentUserId || 
                    String(u) === String(currentUserId) || 
                    Number(u) === Number(currentUserId)
                );
                const count = users.length;
                
                
                // 既存のHTML形式に合わせる
                const userNames = users.map(userId => {
                    // 実際のユーザー名を取得するロジックが必要
                    return userId === this.config.userId ? '自分' : `ユーザー${userId}`;
                }).join(', ');
                
                html += `
                    <div class="reaction-item ${isOwn ? 'own-reaction' : ''}" 
                         title="${userNames}"
                         data-emoji="${emoji}" 
                         data-users='${JSON.stringify(users)}'>
                        <span class="emoji">${emoji}</span>
                        <span class="count">${count}</span>
                    </div>
                `;
            });

            // 追加ボタン
            html += '<button class="add-reaction-btn">➕</button>';
            
            $container.html(html);
        }

        /**
         * 未読カウント更新処理
         */
        handleUnreadCountUpdate(unreadCounts) {
            this.log('📊 未読カウント更新:', unreadCounts);
            
            // グローバルイベントを発火
            $(document).trigger('unread_counts_updated', [unreadCounts]);
        }

        /**
         * リアクションのグループ化
         */
        groupReactions(reactions) {
            const groups = {};
            
            if (!Array.isArray(reactions)) return groups;
            
            
            reactions.forEach(reaction => {
                const { emoji, user_id } = reaction;
                this.log('🔍 リアクション詳細:', {
                    emoji,
                    user_id,
                    user_id_type: typeof user_id,
                    reaction_full: reaction
                });
                
                if (!groups[emoji]) {
                    groups[emoji] = [];
                }
                if (!groups[emoji].includes(user_id)) {
                    groups[emoji].push(user_id);
                }
            });
            
            return groups;
        }

        /**
         * 楽観的UI更新
         */
        optimisticUpdate(messageId, emoji, isAdding) {
            const $message = $(`.chat-message[data-message-id="${messageId}"]`);
            const $container = $message.find('.message-reactions');
            
            if (isAdding) {
                // 追加の楽観的更新
                let $reaction = $container.find(`.reaction-item[data-emoji="${emoji}"]`);
                
                if ($reaction.length > 0) {
                    // 既存リアクションに追加
                    $reaction.addClass('own-reaction');
                    const $count = $reaction.find('.count');
                    $count.text(parseInt($count.text()) + 1);
                } else {
                    // 新規リアクション（既存HTML形式に合わせる）
                    const $addBtn = $container.find('.add-reaction-btn');
                    $(`<div class="reaction-item own-reaction" title="自分" data-emoji="${emoji}">
                        <span class="emoji">${emoji}</span>
                        <span class="count">1</span>
                    </div>`).insertBefore($addBtn);
                }
            } else {
                // 削除の楽観的更新
                const $reaction = $container.find(`.reaction-item[data-emoji="${emoji}"]`);
                $reaction.removeClass('own-reaction');
                
                const $count = $reaction.find('.count');
                const newCount = parseInt($count.text()) - 1;
                
                if (newCount <= 0) {
                    $reaction.remove();
                } else {
                    $count.text(newCount);
                }
            }
            
            // ペンディング状態として記録
            this.pendingReactions.set(messageId, { emoji, action: isAdding ? 'add' : 'remove' });
        }

        /**
         * 楽観的更新のロールバック
         */
        rollbackOptimisticUpdate(messageId, emoji, wasOwn) {
            // サーバーから最新状態を取得
            this.fetchReactionState(messageId);
        }

        /**
         * サーバーから最新のリアクション状態を取得
         */
        async fetchReactionState(messageId) {
            try {
                const response = await $.ajax({
                    url: this.config.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'lms_get_reactions',
                        message_id: messageId,
                        nonce: this.config.nonce
                    }
                });

                if (response.success && response.data) {
                    this.updateReactionUI(messageId, response.data);
                    this.reactionState.set(messageId, response.data);
                }
            } catch (error) {
                this.log('❌ リアクション状態取得エラー:', error);
            }
        }

        /**
         * 高速ポーリングモード
         */
        enterFastPollingMode() {
            this.log('⚡ 高速ポーリングモード開始');
            
            // 現在のポーリングをキャンセル
            if (this.pollTimeout) {
                clearTimeout(this.pollTimeout);
            }
            
            // 即座にポーリング
            this.poll();
            
            // 5秒後に通常モードに戻る
            setTimeout(() => {
                this.log('🔄 通常ポーリングモードに復帰');
            }, 5000);
        }

        /**
         * 即座にポーリングをトリガー
         */
        triggerImmediatePolling() {
            if (this.pollTimeout) {
                clearTimeout(this.pollTimeout);
            }
            this.poll();
        }

        /**
         * 次のポーリングをスケジュール
         */
        scheduleNextPoll() {
            if (!this.isActive) return;
            
            // ペンディングリアクションがある場合は短い間隔
            const interval = this.pendingReactions.size > 0 ? 
                           this.shortPollInterval : 
                           this.pollInterval;
            
            this.pollTimeout = setTimeout(() => this.poll(), interval);
        }

        /**
         * ポーリングエラー処理
         */
        handlePollError() {
            this.retryCount++;
            
            if (this.retryCount >= this.maxRetries) {
                this.log('❌ 最大リトライ回数到達、ポーリング停止');
                this.stopPolling();
                
                // エラー通知
                this.showError('接続エラーが発生しました。ページを更新してください。');
            } else {
                // 指数バックオフでリトライ
                const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
                this.log(`⏳ ${delay}ms後にリトライ (${this.retryCount}/${this.maxRetries})`);
                
                setTimeout(() => this.poll(), delay);
            }
        }

        /**
         * 既存のリアクション読み込み
         */
        loadExistingReactions() {
            $('.chat-message').each((index, element) => {
                const $message = $(element);
                const messageId = $message.data('message-id');
                const $reactions = $message.find('.reaction-item');
                
                if (messageId && $reactions.length > 0) {
                    const reactions = [];
                    
                    $reactions.each((i, el) => {
                        const $reaction = $(el);
                        const emoji = $reaction.data('emoji');
                        const users = $reaction.data('users') || [];
                        
                        users.forEach(userId => {
                            reactions.push({ emoji, user_id: userId });
                        });
                    });
                    
                    this.reactionState.set(messageId, reactions);
                }
            });
            
            this.log(`📥 ${this.reactionState.size}件のリアクション状態を読み込み`);
        }

        /**
         * メッセージ作成処理
         */
        handleMessageCreate(event) {
            // 既存のメッセージ処理システムに委譲
            if (window.LMSChat?.messages?.appendMessage) {
                window.LMSChat.messages.appendMessage(event.data);
            }
        }

        /**
         * メッセージ削除処理
         */
        handleMessageDelete(event) {
            const { message_id } = event.data || {};
            if (message_id) {
                $(`.chat-message[data-message-id="${message_id}"]`).fadeOut(() => {
                    $(this).remove();
                });
            }
        }

        /**
         * 既存のリアクション表示を統合システムで再構築
         */
        rebuildExistingReactions() {
            
            $('.message-reactions').each((index, container) => {
                const $container = $(container);
                const $message = $container.closest('.chat-message');
                const messageId = $message.data('message-id');
                
                if (!messageId) return;
                
                
                // 既存のリアクション要素を解析（既存HTML形式に対応）
                const reactions = [];
                $container.find('.reaction-item').each((i, elem) => {
                    const $elem = $(elem);
                    const emoji = $elem.data('emoji') || $elem.find('.emoji').text();
                    const users = $elem.data('users') || [];
                    const count = parseInt($elem.find('.count').text()) || 1;
                    
                    // ユーザーリストを再構築（既存データから推測）
                    if (Array.isArray(users) && users.length > 0) {
                        reactions.push(...users.map(userId => ({
                            emoji,
                            user_id: userId
                        })));
                    } else if (count > 0) {
                        // ユーザーリストが不明な場合は、own-reactionクラスで判定
                        const hasOwnReaction = $elem.hasClass('own-reaction');
                        const dummyReactions = [];
                        
                        for (let i = 0; i < count; i++) {
                            const userId = (i === 0 && hasOwnReaction) ? this.config.userId : `unknown_${i}`;
                            dummyReactions.push({ emoji, user_id: userId });
                        }
                        reactions.push(...dummyReactions);
                    }
                });
                
                
                // 統合システムのUIで再構築
                if (reactions.length > 0) {
                    this.updateReactionUI(messageId, reactions);
                } else {
                    // リアクションデータが不明な場合は、サーバーから正確なデータを取得
                    this.fetchAndUpdateReactions(messageId);
                }
            });
        }

        /**
         * 緊急修正: 既存のリアクションを即座に修正
         */
        emergencyFixReactions() {
            
            const currentUserId = this.config.userId;
            
            // current-userクラスを持つメッセージのすべてのリアクションを修正
            $('.chat-message.current-user').each((index, messageElem) => {
                const $message = $(messageElem);
                const messageId = $message.data('message-id');
                
                
                const $reactions = $message.find('.reaction-item');
                $reactions.each((i, reactionElem) => {
                    const $reaction = $(reactionElem);
                    const emoji = $reaction.find('.emoji').text();
                    
                    if (!$reaction.hasClass('own-reaction')) {
                        $reaction.addClass('own-reaction');
                    } else {
                    }
                });
            });
            
            // data-user-idが一致するメッセージも修正
            $(`[data-user-id="${currentUserId}"]`).each((index, messageElem) => {
                const $message = $(messageElem);
                const messageId = $message.data('message-id');
                
                
                const $reactions = $message.find('.reaction-item');
                $reactions.each((i, reactionElem) => {
                    const $reaction = $(reactionElem);
                    const emoji = $reaction.find('.emoji').text();
                    
                    if (!$reaction.hasClass('own-reaction')) {
                        $reaction.addClass('own-reaction');
                    }
                });
            });
        }

        /**
         * 現在ユーザーのリアクションを即座に修正
         */
        fixCurrentUserReactions() {
            
            // 現在のユーザーIDを確実に取得
            const currentUserId = this.config.userId;
            
            // 現在ユーザーのメッセージを特定
            const $allMessages = $('.chat-message');
            
            $allMessages.each((index, messageElem) => {
                const $message = $(messageElem);
                const messageUserId = $message.data('user-id');
                const messageId = $message.data('message-id');
                const hasCurrentUserClass = $message.hasClass('current-user');
                
                
                // 複数の条件でチェック
                const isCurrentUserMessage = 
                    String(messageUserId) === String(currentUserId) ||
                    hasCurrentUserClass;
                
                if (isCurrentUserMessage) {
                    
                    const $reactions = $message.find('.message-reactions .reaction-item');
                    
                    $reactions.each((i, reactionElem) => {
                        const $reaction = $(reactionElem);
                        const emoji = $reaction.find('.emoji').text();
                        const hasOwnReaction = $reaction.hasClass('own-reaction');
                        
                        
                        if (!hasOwnReaction) {
                            $reaction.addClass('own-reaction');
                        }
                    });
                } else {
                }
            });
        }

        /**
         * サーバーから正確なリアクションデータを取得して更新
         */
        async fetchAndUpdateReactions(messageId) {
            
            try {
                const response = await $.ajax({
                    url: this.config.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'lms_get_message_reactions',  // 専用のリアクション取得エンドポイント
                        message_id: messageId,
                        nonce: this.config.nonce
                    },
                    timeout: 5000
                });

                if (response.success && response.data) {
                    this.updateReactionUI(messageId, response.data);
                } else {
                }
            } catch (error) {
            }
        }

        /**
         * ポーリング停止
         */
        stopPolling() {
            this.isActive = false;
            if (this.pollTimeout) {
                clearTimeout(this.pollTimeout);
                this.pollTimeout = null;
            }
            this.log('⏹️ ポーリング停止');
        }

        /**
         * ポーリング一時停止
         */
        pausePolling() {
            this.stopPolling();
            this.log('⏸️ ポーリング一時停止');
        }

        /**
         * ポーリング再開
         */
        resumePolling() {
            if (!this.isActive) {
                this.startPolling();
                this.log('▶️ ポーリング再開');
            }
        }

        /**
         * ポーリングリセット
         */
        resetPolling() {
            this.stopPolling();
            this.lastEventId = 0;
            this.lastTimestamp = Math.floor(Date.now() / 1000);
            this.retryCount = 0;
            this.startPolling();
            this.log('🔄 ポーリングリセット');
        }

        /**
         * エラー表示
         */
        showError(message) {
            if (window.LMSChat?.showError) {
                window.LMSChat.showError(message);
            } else {
            }
        }

        /**
         * デバッグログ
         */
        log(...args) {
            if (this.debug) {
            }
        }

        /**
         * 統計情報取得
         */
        getStats() {
            return {
                isActive: this.isActive,
                reactionStateSize: this.reactionState.size,
                pendingReactions: this.pendingReactions.size,
                processingReactions: this.processingReactions.size,
                lastEventId: this.lastEventId,
                lastTimestamp: this.lastTimestamp,
                retryCount: this.retryCount
            };
        }

        /**
         * システム破棄
         */
        destroy() {
            this.stopPolling();
            $(document).off('click', '.reaction-item, .add-reaction-btn');
            $(document).off('channel:switched');
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
            
            this.reactionState.clear();
            this.pendingReactions.clear();
            this.processingReactions.clear();
            
            this.log('💀 システム破棄完了');
        }
    }

    // DOMReady時に初期化
    $(document).ready(function() {
        
        // 既存のシステムを停止
        if (window.LMSReactionManager) {
            if (typeof window.LMSReactionManager.destroy === 'function') {
                window.LMSReactionManager.destroy();
            }
            // 明示的に削除
            delete window.LMSReactionManager;
        }
        
        if (window.UnifiedLongPollClient) {
            if (typeof window.UnifiedLongPollClient.stopPolling === 'function') {
                window.UnifiedLongPollClient.stopPolling();
            }
        }
        
        // 統合システムを起動
        const unifiedSystem = new UnifiedReactionLongPoll();
        
        // グローバルに公開（テスト用）
        window.UnifiedReactionLongPoll = unifiedSystem;
        
    });

})(jQuery);
