(function ($) {
	'use strict';

	window.LMSMediaPreview = {
		currentMedia: null,

		init: function () {
			this.setupEventListeners();
		},

		setupEventListeners: function () {
			// 添付ファイルのクリックイベント（イベント委譲）
			$(document).on('click', '.previewable-attachment', this.handleAttachmentClick.bind(this));

			// ダウンロードボタンのクリックは通常のダウンロード動作
			$(document).on('click', '.attachment-download', function (e) {
				e.stopPropagation(); // 親要素のクリックイベントを防止
			});

			// モーダルを閉じる
			$(document).on('click', '.media-modal-close, .media-modal-overlay', this.closeModal.bind(this));

			// ESCキーでモーダルを閉じる
			$(document).on('keydown', this.handleKeydown.bind(this));
		},

		handleAttachmentClick: function (e) {
			// ダウンロードボタン自体のクリックは無視
			if ($(e.target).closest('.attachment-download').length) {
				return;
			}

			e.preventDefault();
			e.stopPropagation();

			const $attachment = $(e.currentTarget);
			const fileUrl = $attachment.data('file-url');
			const fileName = $attachment.data('file-name');
			const mediaType = $attachment.data('media-type');

			if (!fileUrl || !mediaType) {
				return;
			}

			this.currentMedia = {
				url: fileUrl,
				name: fileName,
				type: mediaType,
			};

			// メディアタイプに応じてモーダルを表示
			switch (mediaType) {
				case 'image':
					this.showImagePreview(fileUrl, fileName);
					break;
				case 'video':
					this.showVideoPreview(fileUrl, fileName);
					break;
				case 'audio':
					this.showAudioPlayer(fileUrl, fileName);
					break;
			}
		},

		showImagePreview: function (url, fileName) {
			const $modal = $('#media-preview-modal');
			const $content = $modal.find('.media-preview-content');
			const $title = $modal.find('.media-modal-title');

			$title.text(fileName || '画像プレビュー');
			$content.html(`<img src="${this.escapeHtml(url)}" alt="${this.escapeHtml(fileName)}" class="media-preview-image">`);

			this.openModal($modal);
		},

		showVideoPreview: function (url, fileName) {
			const $modal = $('#media-preview-modal');
			const $content = $modal.find('.media-preview-content');
			const $title = $modal.find('.media-modal-title');

			$title.text(fileName || '動画プレビュー');
			$content.html(`
				<video controls class="media-preview-video">
					<source src="${this.escapeHtml(url)}">
					お使いのブラウザは動画再生に対応していません。
				</video>
			`);

			this.openModal($modal);

			// 動画を自動再生（オプション）
			const $video = $content.find('video')[0];
			if ($video) {
				$video.play().catch(() => {
					// 自動再生が失敗した場合は何もしない（ユーザーが手動で再生）
				});
			}
		},

		showAudioPlayer: function (url, fileName) {
			const $modal = $('#media-preview-modal');
			const $content = $modal.find('.media-preview-content');
			const $title = $modal.find('.media-modal-title');

			$title.text(fileName || '音声再生');
			$content.html(`
				<div class="audio-player-container">
					<div class="audio-player-title">${this.escapeHtml(fileName)}</div>
					<audio controls class="media-preview-audio">
						<source src="${this.escapeHtml(url)}">
						お使いのブラウザは音声再生に対応していません。
					</audio>
				</div>
			`);

			this.openModal($modal);

			// 音声を自動再生（オプション）
			const $audio = $content.find('audio')[0];
			if ($audio) {
				$audio.play().catch(() => {
					// 自動再生が失敗した場合は何もしない（ユーザーが手動で再生）
				});
			}
		},

		openModal: function ($modal) {
			$modal.fadeIn(200);
			$('body').addClass('media-modal-open');
		},

		closeModal: function (e) {
			if (e) {
				e.preventDefault();
			}

			const $modal = $('#media-preview-modal');
			const $content = $modal.find('.media-preview-content');

			// メディア再生を停止
			$content.find('video, audio').each(function () {
				this.pause();
				this.currentTime = 0;
			});

			$modal.fadeOut(200, function () {
				$content.empty();
			});

			$('body').removeClass('media-modal-open');
			this.currentMedia = null;
		},

		handleKeydown: function (e) {
			// ESCキー
			if (e.keyCode === 27) {
				const $modal = $('#media-preview-modal');
				if ($modal.is(':visible')) {
					this.closeModal();
				}
			}
		},

		escapeHtml: function (text) {
			if (!text) return '';
			const map = {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#039;',
			};
			return text.replace(/[&<>"']/g, (m) => map[m]);
		},
	};

	// DOM読み込み後に初期化
	$(document).ready(function () {
		window.LMSMediaPreview.init();
	});
})(jQuery);
