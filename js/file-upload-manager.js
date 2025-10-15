/**
 * ファイルアップロード管理
 * プレビュー削除時とページ離脱時にサーバーのファイルも削除
 */
(function($) {
	'use strict';

	// アップロード済みファイルの管理
	window.LMSFileManager = window.LMSFileManager || {
		uploadedFiles: new Map(), // { fileId: { id, name, url, container } }

		/**
		 * アップロード完了時にファイルを登録
		 */
		registerFile: function(fileId, fileData, $container) {
			this.uploadedFiles.set(fileId, {
				id: fileId,
				name: fileData.name || '',
				url: fileData.url || '',
				container: $container,
				uploadedAt: Date.now()
			});
		},

		/**
		 * ファイルを削除（サーバーとプレビューの両方）
		 */
		deleteFile: function(fileId) {
			const fileData = this.uploadedFiles.get(fileId);
			if (!fileData) {
				return Promise.resolve();
			}

			// サーバーからファイル削除
			return $.ajax({
				url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
				type: 'POST',
				data: {
					action: 'lms_delete_file',
					file_id: fileId,
					nonce: window.lmsChat?.nonce
				},
				timeout: 5000
			}).then(() => {
				// プレビューから削除
				if (fileData.container) {
					fileData.container.fadeOut(300, function() {
						$(this).remove();
					});
				}
				// 管理リストから削除
				this.uploadedFiles.delete(fileId);
			}).catch((error) => {
				console.error('File delete error:', error);
				// エラーでも管理リストからは削除
				this.uploadedFiles.delete(fileId);
			});
		},

		/**
		 * 未送信のファイルをすべて削除
		 */
		cleanupUnsentFiles: function() {
			const promises = [];
			this.uploadedFiles.forEach((fileData, fileId) => {
				promises.push(this.deleteFile(fileId));
			});
			return Promise.all(promises);
		},

		/**
		 * プレビューコンテナにファイルを追加（×ボタン付き）
		 */
		addFilePreview: function($previewContainer, fileId, fileName, fileUrl) {
			const $preview = $('<div>', {
				class: 'file-preview-item',
				'data-file-id': fileId
			});

			const $fileName = $('<span>', {
				class: 'file-preview-name',
				text: fileName
			});

			const $removeBtn = $('<button>', {
				type: 'button',
				class: 'file-preview-remove',
				html: '&times;',
				title: 'ファイルを削除'
			});

			// 削除ボタンのクリックイベント
			$removeBtn.on('click', (e) => {
				e.preventDefault();
				e.stopPropagation();

				if (confirm('このファイルを削除しますか？')) {
					this.deleteFile(fileId);
				}
			});

			$preview.append($fileName, $removeBtn);
			$previewContainer.append($preview);

			// ファイルを登録
			this.registerFile(fileId, {
				name: fileName,
				url: fileUrl
			}, $preview);

			return $preview;
		}
	};

	// メッセージ送信成功時にファイルリストをクリア
	$(document).on('message:sent', function() {
		window.LMSFileManager.uploadedFiles.clear();
	});

	$(document).on('thread:message_sent', function() {
		window.LMSFileManager.uploadedFiles.clear();
	});

	// ページ離脱時に未送信ファイルを削除
	let isUnloading = false;
	$(window).on('beforeunload', function(e) {
		if (window.LMSFileManager.uploadedFiles.size > 0 && !isUnloading) {
			isUnloading = true;

			// 同期的にファイル削除（beforeunloadでは非同期処理が完了しない可能性があるため）
			const fileIds = Array.from(window.LMSFileManager.uploadedFiles.keys());

			// Navigator.sendBeacon を使用して確実に送信
			fileIds.forEach(fileId => {
				const data = new FormData();
				data.append('action', 'lms_delete_file');
				data.append('file_id', fileId);
				data.append('nonce', window.lmsChat?.nonce || '');

				const url = window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php';

				// sendBeaconが使えない場合は同期Ajax
				if (navigator.sendBeacon) {
					navigator.sendBeacon(url, data);
				} else {
					$.ajax({
						url: url,
						type: 'POST',
						data: {
							action: 'lms_delete_file',
							file_id: fileId,
							nonce: window.lmsChat?.nonce
						},
						async: false // 同期的に実行
					});
				}
			});

			window.LMSFileManager.uploadedFiles.clear();
		}
	});

	// ページリロード時にもクリーンアップ
	$(window).on('pagehide', function() {
		if (window.LMSFileManager.uploadedFiles.size > 0) {
			window.LMSFileManager.cleanupUnsentFiles();
		}
	});

})(jQuery);
