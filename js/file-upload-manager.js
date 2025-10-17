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

			// state.pendingFilesを確実に初期化して登録
			if (!window.LMSChat) {
				window.LMSChat = {};
			}
			if (!window.LMSChat.state) {
				window.LMSChat.state = {};
			}
			if (!window.LMSChat.state.pendingFiles) {
				window.LMSChat.state.pendingFiles = new Map();
			}

			window.LMSChat.state.pendingFiles.set(fileId, fileData);
		},

		/**
		 * ファイルをアップロード
		 */
		uploadFile: function(file, $previewContainer) {
			// ローディングインジケーターを作成
			const $loadingIndicator = $('<div>', {
				class: 'file-upload-loading'
			}).html(`
				<div class="loading-spinner"></div>
				<span class="loading-text">アップロード中...</span>
			`);

			// ローディングを表示
			$previewContainer.append($loadingIndicator);

		const formData = new FormData();
		formData.append('action', 'lms_upload_file');
		formData.append('file', file);
		formData.append('nonce', window.lmsChat?.nonce || '');

		return $.ajax({
			url: window.lmsChat?.ajaxUrl || '/wp-admin/admin-ajax.php',
			type: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			timeout: 30000
	}).then((response) => {
		if (response.success && response.data) {
			const self = this;
			// ローディングを完全に削除してからプレビューを表示
			$loadingIndicator.fadeOut(200, function() {
				$(this).remove();

				// プレビューを追加（最初は非表示）
				const $preview = self.addFilePreview($previewContainer, response.data);

				// プレビューをフェードインで表示
				$preview.hide().fadeIn(300);
			});
			return response.data;
		} else {
			// エラー時はローディングを削除
			$loadingIndicator.fadeOut(200, function() {
				$(this).remove();
			});

			// エラーメッセージを適切に取得
			const errorMessage = typeof response.data === 'string' 
				? response.data 
				: (response.message || 'ファイルのアップロードに失敗しました');
			throw new Error(errorMessage);
		}
	}).catch((error) => {
		// ローディングを削除
		$loadingIndicator.fadeOut(200, function() {
			$(this).remove();
		});

		// Ajax エラーの場合
		if (error.responseJSON && error.responseJSON.data) {
			throw new Error(error.responseJSON.data);
		} else if (error.statusText && error.statusText !== 'error') {
			throw new Error('通信エラー: ' + error.statusText);
		} else if (error.message) {
			throw error; // 既にエラーオブジェクトの場合はそのまま
		} else {
			throw new Error('ファイルのアップロードに失敗しました');
		}
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

		// 削除中のローディングインジケーターを作成
		const $deleteLoading = $('<div>', {
			class: 'file-delete-loading'
		}).html(`
			<div class="loading-spinner"></div>
			<span class="loading-text">削除中...</span>
		`);

		// プレビューアイテムにローディングを追加
		if (fileData.container) {
			fileData.container.css('position', 'relative').append($deleteLoading);
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
			// ローディングを完全に削除してからプレビューを削除
			if (fileData.container) {
				$deleteLoading.fadeOut(200, function() {
					$(this).remove();
					// プレビュー全体をフェードアウトして削除
					fileData.container.fadeOut(300, function() {
						$(this).remove();
					});
				});
			}
			// 管理リストから削除
			this.uploadedFiles.delete(fileId);

			// state.pendingFilesからも削除
			if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.pendingFiles) {
				window.LMSChat.state.pendingFiles.delete(fileId);
			}
		}).catch((error) => {
			// エラー時はローディングを削除
			$deleteLoading.fadeOut(200, function() {
				$(this).remove();
			});

			// エラーでも管理リストからは削除
			this.uploadedFiles.delete(fileId);

			// state.pendingFilesからも削除
			if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.pendingFiles) {
				window.LMSChat.state.pendingFiles.delete(fileId);
			}
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
		addFilePreview: function($previewContainer, fileData) {
		const fileId = fileData.id;
		const fileName = fileData.name;
		const fileUrl = fileData.url;
		const fileType = fileData.type || '';
		const thumbnail = fileData.thumbnail;
		const icon = fileData.icon;

		const $preview = $('<div>', {
			class: 'file-preview-item',
			'data-file-id': fileId
		});

		// ファイルのプレビュー/アイコン表示
		const $fileVisual = $('<div>', {
			class: 'file-preview-visual'
		});

		if (thumbnail && fileType.startsWith('image/')) {
			// 画像の場合はサムネイル表示
			const $thumbnail = $('<img>', {
				src: thumbnail,
				alt: fileName,
				class: 'file-preview-thumbnail'
			});
			$fileVisual.append($thumbnail);
		} else if (icon) {
			// その他のファイルはアイコン表示
			const $icon = $('<img>', {
				src: icon,
				alt: fileName,
				class: 'file-preview-icon'
			});
			$fileVisual.append($icon);
		}

		const $fileName = $('<span>', {
			class: 'file-preview-name',
			text: fileName,
			title: fileName // ツールチップ表示
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

		$preview.append($fileVisual, $fileName, $removeBtn);
		$previewContainer.append($preview);

		// ファイルを登録
		this.registerFile(fileId, fileData, $preview);

		return $preview;
		}
	};

	// メッセージ送信成功時にファイルリストをクリア
	$(document).on('message:sent', function() {
		// 🔥 送信済みファイルIDをsessionStorageに記録（削除保護）
		const sentFileIds = Array.from(window.LMSFileManager.uploadedFiles.keys());
		if (sentFileIds.length > 0) {
			const existingSentIds = JSON.parse(sessionStorage.getItem('lms_sent_file_ids') || '[]');
			const mergedIds = [...new Set([...existingSentIds, ...sentFileIds])];
			sessionStorage.setItem('lms_sent_file_ids', JSON.stringify(mergedIds));
		}

		window.LMSFileManager.uploadedFiles.clear();
		if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.pendingFiles) {
			window.LMSChat.state.pendingFiles.clear();
		}
		$('.file-preview').empty();
	});

	$(document).on('thread:message_sent', function() {
		// 🔥 送信済みファイルIDをsessionStorageに記録（削除保護）
		const sentFileIds = Array.from(window.LMSFileManager.uploadedFiles.keys());
		if (sentFileIds.length > 0) {
			const existingSentIds = JSON.parse(sessionStorage.getItem('lms_sent_file_ids') || '[]');
			const mergedIds = [...new Set([...existingSentIds, ...sentFileIds])];
			sessionStorage.setItem('lms_sent_file_ids', JSON.stringify(mergedIds));
		}

		window.LMSFileManager.uploadedFiles.clear();
		if (window.LMSChat && window.LMSChat.state && window.LMSChat.state.pendingFiles) {
			window.LMSChat.state.pendingFiles.clear();
		}
		$('.thread-input-container .file-preview').empty();
	});

	// UIイベントハンドラー
	$(document).ready(function() {
		// ファイル添付ボタンのクリックイベント
		$(document).on('click', '.attach-file-button', function(e) {
			e.preventDefault();
			
			// チャンネル未選択チェック
			if (!window.LMSChat || !window.LMSChat.state || !window.LMSChat.state.currentChannel) {
				alert('チャンネルを選択してください');
				return;
			}
			
			$('#file-upload').click();
		});

		// ファイル選択時の処理
		$('#file-upload').on('change', function(e) {
			const files = e.target.files;
			if (!files || files.length === 0) {
				return;
			}

			// プレビューコンテナを取得
			const $previewContainer = $('.file-preview').first();

			// 各ファイルをアップロード
			Array.from(files).forEach(file => {
				window.LMSFileManager.uploadFile(file, $previewContainer)
					.catch(error => {
						const errorMsg = error && error.message 
							? error.message 
							: 'ファイルのアップロードに失敗しました';
						alert('ファイルのアップロードに失敗しました:\n' + errorMsg);
					});
			});

			// input要素をクリア（同じファイルを再選択可能にする）
			$(this).val('');
		});

		// ドラッグ&ドロップ機能
		const $dropZones = $('.chat-input-container, .thread-input-container');
		
		$dropZones.on('dragover', function(e) {
			e.preventDefault();
			e.stopPropagation();
			// form要素にdrag-overクラスを付与
			$(this).find('form').addClass('drag-over');
		});

		$dropZones.on('dragleave', function(e) {
			e.preventDefault();
			e.stopPropagation();
			// form要素からdrag-overクラスを削除
			$(this).find('form').removeClass('drag-over');
		});

		$dropZones.on('drop', function(e) {
			e.preventDefault();
			e.stopPropagation();
			// form要素からdrag-overクラスを削除
			$(this).find('form').removeClass('drag-over');

			// チャンネル未選択チェック
			if (!window.LMSChat || !window.LMSChat.state || !window.LMSChat.state.currentChannel) {
				alert('チャンネルを選択してください');
				return;
			}

			const files = e.originalEvent.dataTransfer.files;
			if (!files || files.length === 0) {
				return;
			}

			// プレビューコンテナを取得
			const $previewContainer = $(this).find('.file-preview').first();
			if ($previewContainer.length === 0) {
				alert('プレビューエリアが見つかりません');
				return;
			}

			// 各ファイルをアップロード
			Array.from(files).forEach(file => {
				window.LMSFileManager.uploadFile(file, $previewContainer)
					.catch(error => {
						const errorMsg = error && error.message 
							? error.message 
							: 'ファイルのアップロードに失敗しました';
						alert('ファイルのアップロードに失敗しました:\n' + errorMsg);
					});
			});
		});
	});

	// ページ離脱時に未送信ファイルのみを削除
	let isUnloading = false;
	$(window).on('beforeunload', function(e) {
		if (window.LMSFileManager.uploadedFiles.size > 0 && !isUnloading) {
			isUnloading = true;

			// 🔥 送信済みファイルIDを取得（削除しないファイル）
			const sentFileIds = JSON.parse(sessionStorage.getItem('lms_sent_file_ids') || '[]');

			// 同期的にファイル削除（beforeunloadでは非同期処理が完了しない可能性があるため）
			const fileIds = Array.from(window.LMSFileManager.uploadedFiles.keys());

			// 🔥 送信済みファイルを除外して未送信ファイルのみ削除
			const unsentFileIds = fileIds.filter(fileId => !sentFileIds.includes(fileId));

			if (unsentFileIds.length === 0) {
				// 未送信ファイルがない場合は何もしない
				return;
			}

			// Navigator.sendBeacon を使用して確実に送信
			unsentFileIds.forEach(fileId => {
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

			// 🔥 未送信ファイルのみクリア（送信済みファイルは保護）
			unsentFileIds.forEach(fileId => {
				window.LMSFileManager.uploadedFiles.delete(fileId);
			});
		}
	});

	// ページリロード時にもクリーンアップ（未送信ファイルのみ）
	$(window).on('pagehide', function() {
		if (window.LMSFileManager.uploadedFiles.size > 0) {
			// 🔥 送信済みファイルIDを取得（削除しないファイル）
			const sentFileIds = JSON.parse(sessionStorage.getItem('lms_sent_file_ids') || '[]');
			const fileIds = Array.from(window.LMSFileManager.uploadedFiles.keys());

			// 🔥 送信済みファイルを除外して未送信ファイルのみ削除
			const unsentFileIds = fileIds.filter(fileId => !sentFileIds.includes(fileId));

			if (unsentFileIds.length > 0) {
				// 未送信ファイルのみ削除
				unsentFileIds.forEach(fileId => {
					window.LMSFileManager.deleteFile(fileId);
				});
			}
		}
	});

})(jQuery);
