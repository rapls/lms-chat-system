/**
 * SMOOTH FIX - スレッドリアクション1回クリック削除の完全解決
 * 
 * 問題: 重複実行による点滅とリアクション削除失敗
 * 解決: キャプチャフェーズでの最優先制御 + 30秒絶対ロック + Fetch API
 * 
 * 成功日: 2025-09-26
 * 確認済み: サーバーログで1回実行、フロントエンドでスムーズな削除
 */
(function($) {
    'use strict';


    // 最強レベルのロック（30秒間）
    window.SMOOTH_LOCK = window.SMOOTH_LOCK || new Map();

    // ページ全体のイベント制御（キャプチャフェーズで最優先実行）
    document.addEventListener('click', function(e) {
        const target = e.target.closest('.reaction-item');
        if (!target) return;

        // すべてのリアクションクリックを最上位でキャッチ
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        const emoji = target.dataset.emoji;
        const messageEl = target.closest('.thread-message[data-message-id]');
        const messageId = messageEl?.dataset.messageId;

        if (!messageId || !emoji) return;

        const lockKey = `SMOOTH-${messageId}-${emoji}`;
        const now = Date.now();

        // 30秒間の絶対ロック
        if (window.SMOOTH_LOCK.has(lockKey)) {
            const lockTime = window.SMOOTH_LOCK.get(lockKey);
            if (now - lockTime < 30000) {
                return;
            }
        }

        window.SMOOTH_LOCK.set(lockKey, now);

        const wasUserReacted = target.classList.contains('user-reacted');

        // 即座のスムーズな視覚フィードバック
        target.style.transition = 'all 0.3s ease';
        target.style.opacity = '0.3';
        target.style.backgroundColor = '#e8eaf6';
        target.style.borderColor = '#3f51b5';
        target.style.transform = 'scale(0.92)';

        // 単一Ajax実行（Fetch APIで確実な処理）
        fetch(window.lmsChat.ajaxUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'lms_toggle_thread_reaction',
                message_id: messageId,
                emoji: emoji,
                nonce: window.lmsChat.nonce,
                user_id: window.lmsChat.currentUserId,
                is_removing: wasUserReacted
            })
        })
        .then(response => response.json())
        .then(data => {

            if (data.success && data.data) {
                smoothUpdateDOM(messageId, data.data.reactions || []);
            }
        })
        .catch(error => {
            // エラー時は元に戻す
            target.style.opacity = '';
            target.style.backgroundColor = '';
            target.style.borderColor = '';
            target.style.transform = '';
        })
        .finally(() => {
            // 30秒後にロック解除
            setTimeout(() => {
                window.SMOOTH_LOCK.delete(lockKey);
            }, 30000);
        });

    }, true); // true = キャプチャフェーズで実行（最優先）

    /**
     * スムーズなDOM更新
     */
    window.smoothUpdateDOM = function(messageId, reactions) {
        const messageEl = document.querySelector(`.thread-message[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const container = messageEl.querySelector('.message-reactions');


        if (!reactions || reactions.length === 0) {
            if (container) {
                container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                container.style.opacity = '0';
                container.style.transform = 'scale(0.8)';
                setTimeout(() => container.remove(), 300);
            }
            return;
        }

        // グループ化
        const grouped = {};
        reactions.forEach(r => {
            const emoji = r.reaction || r.emoji;
            if (!grouped[emoji]) {
                grouped[emoji] = {emoji, count: 0, userIds: [], users: []};
            }
            grouped[emoji].count++;
            grouped[emoji].userIds.push(parseInt(r.user_id));
            grouped[emoji].users.push(r.display_name || `User${r.user_id}`);
        });

        // 新しいHTML生成
        let html = '<div class="message-reactions SMOOTH-updated">';
        Object.values(grouped).forEach(g => {
            const currentUserId = parseInt(window.lmsChat.currentUserId);
            const userReacted = g.userIds.includes(currentUserId);
            const cls = userReacted ? 'user-reacted' : '';

            html += `<div class="reaction-item SMOOTH-item ${cls}" data-emoji="${g.emoji}" data-users="${g.users.join(', ')}" data-user-ids="${g.userIds.join(',')}">
                <span class="emoji">${g.emoji}</span>
                <span class="count">${g.count}</span>
            </div>`;
        });
        html += '</div>';

        // スムーズな置換
        if (container) {
            container.style.transition = 'opacity 0.2s ease';
            container.style.opacity = '0';
            setTimeout(() => {
                container.outerHTML = html;
                const newContainer = messageEl.querySelector('.message-reactions');
                newContainer.style.opacity = '0';
                newContainer.style.transition = 'opacity 0.3s ease';
                setTimeout(() => newContainer.style.opacity = '1', 50);
            }, 200);
        } else {
            const contentEl = messageEl.querySelector('.message-content');
            contentEl.insertAdjacentHTML('afterend', html);
            const newContainer = messageEl.querySelector('.message-reactions');
            newContainer.style.opacity = '0';
            newContainer.style.transition = 'opacity 0.3s ease';
            setTimeout(() => newContainer.style.opacity = '1', 50);
        }

    };

    /**
     * デバッグ用関数
     */
    window.smoothStatus = function() {
    };


})(jQuery);