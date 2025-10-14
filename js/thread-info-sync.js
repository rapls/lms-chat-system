/**
 * スレッド情報リアルタイム更新
 * 既存のコードを変更せず、イベントリスナーのみで実装
 */
(function($) {
	'use strict';

	function requestThreadRefresh(parentMessageId, options) {
		if (!parentMessageId) {
			return;
		}
		if (typeof window.refreshThreadInfo !== 'function') {
			return;
		}
		window.refreshThreadInfo(parentMessageId, options || {});
	}

	// スレッドメッセージ投稿時に親メッセージ情報を更新（楽観的更新: +1）
	$(document).on('thread:reply:sent', function(event, parentMessageId) {
		requestThreadRefresh(parentMessageId, { optimisticData: { delta: +1, applyWhilePending: true } });
	});

	// Long Polling経由のスレッドメッセージ投稿時（楽観的更新: +1）
	$(document).on('lms_longpoll_thread_message_posted', function(event, messageData) {
		if (!messageData) {
			return;
		}
		const parentMessageId = messageData.parent_message_id || messageData.parentMessageId;
		// 即座にカウントを増やし、同時にサーバーからアバター情報を取得
		requestThreadRefresh(parentMessageId, { optimisticData: { delta: +1, applyWhilePending: true } });
	});

	// スレッドメッセージ削除時に親メッセージ情報を更新（楽観的更新: -1）
	$(document).on('thread_message:deleted', function(event, data) {
		if (!data) {
			return;
		}
		const parentMessageId = data.threadId || data.parentMessageId || data.parent_message_id;
		// 即座にカウントを減らし、同時にサーバーからアバター情報を取得
		requestThreadRefresh(parentMessageId, { optimisticData: { delta: -1, applyWhilePending: true } });
	});

	// Long Polling経由のスレッドメッセージ削除時（楽観的更新: -1）
	$(document).on('lms_longpoll_thread_message_deleted', function(event, messageData) {
		if (!messageData) {
			return;
		}
		const parentMessageId = messageData.parent_message_id || messageData.parentMessageId;
		// 即座にカウントを減らし、同時にサーバーからアバター情報を取得
		requestThreadRefresh(parentMessageId, { optimisticData: { delta: -1, applyWhilePending: true } });
	});

})(jQuery);
