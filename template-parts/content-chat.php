<?php

/**
 * チャット機能のテンプレート (改良版)
 *
 * @package LMS Theme
 */

if (! class_exists('LMS_Auth') || ! class_exists('LMS_Chat')) {
	echo '<div class="error-message">必要なクラスが見つかりません。</div>';
	return;
}

$auth = LMS_Auth::get_instance();
$chat = LMS_Chat::get_instance();

$current_user = $auth->get_current_user();
$user_id = 0;

if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] > 0) {
	$user_id = (int) $_SESSION['lms_user_id'];
}

if ($user_id === 0 && $current_user) {
	if (is_object($current_user) && isset($current_user->id)) {
		$user_id = (int) $current_user->id;
		$_SESSION['lms_user_id'] = $user_id;
	} elseif (is_array($current_user) && isset($current_user['id'])) {
		$user_id = (int) $current_user['id'];
		$_SESSION['lms_user_id'] = $user_id;
	}
}

if ($current_user && is_object($current_user) && isset($current_user->id)) {
	$correct_user_id = (int) $current_user->id;

	if (isset($_SESSION['lms_user_id']) && $_SESSION['lms_user_id'] != $correct_user_id && $correct_user_id > 0) {

		$_SESSION['lms_user_id'] = $correct_user_id;
		$_SESSION['lms_user_type'] = $current_user->user_type;
		$_SESSION['lms_user_ip'] = $_SERVER['REMOTE_ADDR'];
	}

	$user_id = $correct_user_id;
	$_SESSION['lms_user_id'] = $correct_user_id;
	$_SESSION['lms_user_ip'] = $_SERVER['REMOTE_ADDR'];

} else {
	if ($user_id > 0) {
	} else {
		$user_id = 0;
	}
}

if ($user_id === 0) {
}

if ($current_user && isset($current_user->user_type)) {
	$_SESSION['lms_user_type'] = $current_user->user_type;
}

$channels = $chat->get_channels($user_id);

$default_channel_id = 1;
if (!empty($channels) && is_array($channels)) {
    $first_channel = reset($channels);
    if (is_object($first_channel) && isset($first_channel->id)) {
        $default_channel_id = (int)$first_channel->id;
    }
}
?>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
<script src="https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ja.js"></script>

<!-- 高速チャンネルシステム v2.0 -->
<script>
// 新しい超高速チャンネルシステム
(function() {
    'use strict';
    // ちらつき防止CSS
    const style = document.createElement('style');
    style.textContent = `
        #chat-messages {
            scroll-behavior: auto !important;
            overflow-anchor: none !important;
            position: relative;
        }
        #chat-messages.switching {
            opacity: 0.5;
            pointer-events: none;
        }

        /* メッセージ追加時のちらつき防止 */
        #chat-messages.message-updating {
            scroll-behavior: auto !important;
            overflow-anchor: none !important;
        }

        /* 新しいメッセージのアニメーション無効化（フェードイン対象は除外） */
        #chat-messages .chat-message:not(.infinity-scroll-new-message) {
            animation: none !important;
            transition: none !important;
        }
        
        /* フェードイン対象メッセージは除外して通常のメッセージのみ無効化 */
        #chat-messages .chat-message:not(.fade-in-ready):not(.fade-in-active):not(.fade-in-complete) {
            animation: none !important;
            transition: none !important;
        }

        /* スムーススクロール完全無効化 */
        *, html, body {
            scroll-behavior: auto !important;
        }
    `;
    document.head.appendChild(style);

    // DOMContentLoadedで高速初期化
    document.addEventListener('DOMContentLoaded', function() {

        // チャンネルクリックハンドラー（最速）
        document.addEventListener('click', function(e) {
            const channelItem = e.target.closest('.channel-item');
            if (!channelItem) return;

            const channelId = channelItem.getAttribute('data-channel-id');

            // シンプルなスクロール制御（パフォーマンス向上）
            const container = document.getElementById('chat-messages');
            if (container) {
                container.classList.add('switching');

                // 効率的なスクロール - 2回だけ実行
                const scrollToBottom = () => {
                    const maxScroll = container.scrollHeight - container.clientHeight;
                    if (maxScroll > 0) {
                        container.scrollTop = maxScroll;
                    }
                };

                scrollToBottom();
                setTimeout(scrollToBottom, 300);

                // 1秒後にクラス削除
                setTimeout(() => {
                    container.classList.remove('switching');
                }, 1000);
            }
        }, true); // キャプチャフェーズで処理
    });

    // メッセージ送信時のちらつき防止システム
    const preventMessageFlicker = () => {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        let isScrollLocked = false;
        let scrollLockTimer = null;
        // DOM変更監視でメッセージ追加を検出
        const observer = new MutationObserver(function(mutations) {
            // 🛡️ 基本的な保護チェック
            if (window.LMSChat?.state?.isLoading ||
                container.hasAttribute('data-mutation-disabled') ||
                container.hasAttribute('data-scroll-locked') ||
                document.querySelector('.offscreen-builder')) {
                return;
            }

            let hasNewMessages = false;
            let isTopInsertion = false;

            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' &&
                    (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {

                    // 上部挿入（インフィニティスクロール）か下部挿入（新規メッセージ）かを判定
                    if (mutation.addedNodes.length > 0) {
                        const firstNode = mutation.addedNodes[0];
                        if (firstNode.nodeType === 1) { // Element node
                            // 挿入位置が上位20%の場合は上部挿入（インフィニティスクロール）と判定
                            const insertionPosition = Array.from(container.children).indexOf(firstNode);
                            const totalChildren = container.children.length;
                            const insertionRatio = insertionPosition / totalChildren;

                            if (insertionRatio <= 0.2) {
                                isTopInsertion = true;
                            } else {
                                hasNewMessages = true;
                            }
                        }
                    } else if (mutation.removedNodes.length > 0) {
                        hasNewMessages = true; // 削除は通常処理
                    }
                }
            });

            // 上部挿入の場合は自動スクロールしない
            if (isTopInsertion) {
                return;
            }

            if (hasNewMessages) {

                // 効率的なスクロール処理
                const maxScroll = container.scrollHeight - container.clientHeight;
                if (maxScroll > 0) {
                    container.scrollTop = maxScroll;
                }

                // スクロール位置を短時間ロック
                isScrollLocked = true;

                // 連続で位置を維持（300ms間、15msごと）
                let lockCount = 0;
                const maintainBottom = () => {
                    if (!isScrollLocked || lockCount > 20) return; // 20回 × 15ms = 300ms

                    const currentMax = container.scrollHeight - container.clientHeight;
                    container.scrollTop = currentMax;
                    lockCount++;

                    setTimeout(maintainBottom, 15);
                };
                maintainBottom();

                // 300ms後にロック解除
                if (scrollLockTimer) clearTimeout(scrollLockTimer);
                scrollLockTimer = setTimeout(() => {
                    isScrollLocked = false;
                }, 300);
            }
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: false // 属性変更は監視しない
        });
    };

    // 初期化後すぐに開始
    setTimeout(preventMessageFlicker, 500);
})();
</script>

<div class="chat-wrapper">
	<div class="chat-container">
		<div class="chat-sidebar">
			<div class="channels-header">
				<h2>チャンネル一覧</h2>
			</div>
			<div class="channels-list">
				<?php if ($channels && ! empty($channels)) : ?>
					<div class="channel-section">
						<h3 class="channel-section-title">全体チャンネル</h3>
						<?php foreach ($channels as $channel) : ?>
							<?php if ($channel->type === 'public') : ?>
								<div class="channel-item" data-channel-id="<?php echo esc_attr($channel->id); ?>" data-channel-type="public">
									<div class="channel-name">
										<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-hash.svg'); ?>" alt="" class="channel-icon">
										<span><?php echo esc_html($channel->name); ?></span>
									</div>
									<span class="unread-badge chat-element-hidden"></span>
								</div>
							<?php endif; ?>
						<?php endforeach; ?>
					</div>

					<div class="channel-section">
						<h3 class="channel-section-title">プライベートチャンネル</h3>
						<?php foreach ($channels as $channel) : ?>
							<?php if ($channel->type === 'private' || $channel->type === 'user') : ?>
								<div class="channel-item" data-channel-id="<?php echo esc_attr($channel->id); ?>" data-channel-type="private">
									<div class="channel-name">
										<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-lock.svg'); ?>" alt="" class="channel-icon">
										<span><?php echo esc_html(isset($channel->display_name) ? $channel->display_name : $channel->name); ?></span>
									</div>
									<span class="unread-badge chat-element-hidden"></span>
								</div>
							<?php endif; ?>
						<?php endforeach; ?>
					</div>
				<?php else : ?>
					<div class="no-channels">
						<p>チャンネルがありません</p>
					</div>
				<?php endif; ?>
			</div>
		</div>

		<div class="chat-main">
			<div class="chat-header">
				<div class="channel-info">
					<span class="channel-header-icon">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-hash.svg'); ?>" alt="" class="icon-hash">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-lock.svg'); ?>" alt="" class="icon-lock">
					</span>
					<h2 id="current-channel-name">
						<span class="channel-header-text">チャンネルを選択してください</span>
					</h2>
				</div>

				<div class="header-right">
					<div class="chat-search-container">
						<div class="search-input-wrapper">
							<input type="text" id="chat-search-input" class="chat-search-input" placeholder="メッセージを検索" aria-label="メッセージを検索">
							<button type="button" id="chat-search-button" class="chat-search-button" aria-label="検索">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill="currentColor" />
								</svg>
							</button>
							<div class="search-history-container">
							</div>
						</div>
						<button type="button" id="chat-search-options-button" class="chat-search-options-button" aria-label="検索オプション">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M3 17V19H9V17H3ZM3 5V7H13V5H3ZM13 21V19H21V17H13V15H11V21H13ZM7 9V11H3V13H7V15H9V9H7ZM21 13V11H11V13H21ZM15 9H17V7H21V5H17V3H15V9Z" fill="currentColor" />
							</svg>
						</button>
						<div class="search-options-panel">
							<div class="search-option">
								<label for="search-channel">チャンネル:</label>
								<select id="search-channel">
									<option value="current">現在のチャンネル</option>
									<option value="all">すべてのチャンネル</option>
								</select>
							</div>
							<div class="search-option">
								<label for="search-user">ユーザー:</label>
								<select id="search-user">
									<option value="0">すべてのユーザー</option>
								</select>
							</div>
							<div class="search-option">
								<label for="search-date-from">期間:</label>
								<div class="date-range-inputs">
									<input type="text" id="search-date-from" class="date-picker" placeholder="開始日">
									<span>〜</span>
									<input type="text" id="search-date-to" class="date-picker" placeholder="終了日">
								</div>
							</div>
							<div class="search-option-buttons">
								<button type="button" id="reset-search-options" class="reset-search-options">リセット</button>
							</div>
						</div>
					</div>
					<span class="channel-members-count"></span>
					<div class="chat-header-actions">
						<div class="menu-dropdown">
							<button type="button" class="menu-button" id="chatMenuButton" aria-label="メニューを開く" tabindex="0">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<circle cx="12" cy="6" r="2" fill="currentColor" />
									<circle cx="12" cy="12" r="2" fill="currentColor" />
									<circle cx="12" cy="18" r="2" fill="currentColor" />
								</svg>
							</button>
							<div class="menu-content" id="chatMenuContent">
								<?php if (get_option('lms_push_enabled', '0') === '1') : ?>
									<a href="#" class="menu-item notification-item" id="enableNotificationsButton" tabindex="0" aria-label="通知を有効にする">
										<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
											<path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z" fill="currentColor" />
										</svg>
										<span>プッシュ通知を有効にする</span>
									</a>
								<?php endif; ?>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div id="chat-messages" data-current-user-id="<?php echo esc_attr($user_id); ?>" class="chat-messages">
			</div>

			<div class="chat-input-container">
				<form id="chat-form">
					<button type="button" class="attach-file-button">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-attach.svg'); ?>" alt="ファイルを添付">
					</button>
					<textarea id="chat-input" class="chat-input"
						placeholder="メッセージを入力..."
						rows="1" maxlength="1000" required></textarea>
					<button type="submit" class="send-button" disabled>送信</button>
				</form>
				<div class="file-preview"></div>
			</div>
		</div>
	</div>

	<div id="thread-panel" class="thread-panel">
		<div class="thread-header">
			<h3 id="thread-title">スレッド <span class="thread-count"></span></h3>
			<button class="close-thread" onclick="if(window.closeThread) window.closeThread(); return false;">&times;</button>
		</div>
		<div id="thread-parent-message" class="parent-message"></div>
		<div class="thread-messages"></div>
		<div class="thread-input-container">
			<form id="thread-form">
				<div class="input-wrapper">
					<button type="button" class="attach-file-button">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-attach.svg'); ?>" alt="ファイルを添付">
					</button>
					<textarea id="thread-input" class="thread-input"
						placeholder="返信を入力..."
						rows="1" maxlength="1000" required></textarea>
					<button type="submit" class="send-button" disabled>送信</button>
				</div>
			</form>
			<div class="file-preview"></div>
		</div>
	</div>

	<div id="members-modal" class="members-modal">
		<div class="members-modal-content">
			<div class="members-modal-header">
				<h3>チャンネル参加者</h3>
				<button class="close-modal">&times;</button>
			</div>
			<div class="members-list">
			</div>
		</div>
	</div>
</div>

<!-- ファイルアップロード用の input -->
<input type="file" id="file-upload" name="file" multiple
	accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.tar,.gz,.bz2,.xz,.lzma,
		.ttf,.woff,.woff2,.psd,.ai,.xd,.eps,.psb,.proj,.ini,.pub,.txt,.md,
		.php,.js,.html,.htm,.css,.scss,.sql,.c,.cpp,.cs,.java,.py,.sh,.ts,.xml,.cobol,
		.json,.csv,.yml,.yaml,.svg,.ods,.bmp,.tiff,.heic,.heif,.mov,.mpeg2,.mpeg,.mp2,.h264,.h265,.divx,.mkv"
	class="chat-element-hidden">

<!-- 検索結果モーダル -->
<div id="search-results-modal" class="search-results-modal" style="display: none;">
	<div class="search-results-container">
		<div class="search-results-header">
			<h3 class="search-results-title">検索結果: <span class="search-query"></span></h3>
			<button type="button" class="close-search-results">&times;</button>
		</div>
		<div class="search-results-body">
			<div class="search-results-list">
			</div>
			<div class="search-results-loading">
				<div class="spinner"></div>
				<p>読み込み中...</p>
			</div>
			<div class="search-results-empty">
				<p>検索結果はありません</p>
			</div>
		</div>
	</div>
</div>

<script>
	window.lmsChat = {
		ajaxUrl: <?php echo json_encode(admin_url('admin-ajax.php')); ?>,
		nonce: <?php echo json_encode(wp_create_nonce('lms_ajax_nonce')); ?>,
		currentUserId: <?php echo json_encode((int) $user_id); ?>,
		currentUserName: <?php echo json_encode($current_user && isset($current_user->display_name) ? $current_user->display_name : 'Unknown User'); ?>,
		currentUserAvatar: <?php echo json_encode($current_user && isset($current_user->avatar_url) ? $current_user->avatar_url : get_template_directory_uri() . '/img/default-avatar.png'); ?>,
		userType: <?php echo json_encode(isset($_SESSION['lms_user_type']) ? $_SESSION['lms_user_type'] : 'student'); ?>,
		siteUrl: <?php echo json_encode(parse_url(site_url(), PHP_URL_PATH)); ?>,
		templateUrl: <?php echo json_encode(get_template_directory_uri()); ?>,
		pollInterval: 3000,
		maxFileSize: <?php echo json_encode(wp_max_upload_size()); ?>,
		sseEnabled: false,
		initialChannelId: <?php echo json_encode($default_channel_id); ?>,
		currentChannelId: <?php echo json_encode($default_channel_id); ?>,
		allowedFileTypes: <?php echo json_encode(array(
												'image/jpeg',
												'image/png',
												'image/gif',
												'image/webp',
												'application/pdf',
												'application/msword',
												'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
												'application/vnd.ms-excel',
												'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
												'application/zip',
												'application/x-gzip',
												'audio/mpeg',
												'audio/aac',
												'video/mp4',
												'video/mpeg'
											)); ?>
	};

	window.lmsPush = Object.freeze({
		currentUserId: <?php echo json_encode((int) $user_id); ?>,
		ajaxUrl: <?php echo json_encode(admin_url('admin-ajax.php')); ?>,
		nonce: <?php echo json_encode(wp_create_nonce('lms_push_nonce')); ?>,
		vapidPublicKey: <?php echo json_encode(get_option('lms_vapid_public_key')); ?>,
		isEnabled: <?php echo json_encode(get_option('lms_push_enabled', '0') === '1'); ?>,
		debug: false
	});

	if (!window.lmsChat || typeof window.lmsChat.currentUserId !== 'number' || window.lmsChat.currentUserId <= 0) {
		const isOnChatPage = window.location.pathname.includes('/chat/');

		if (isOnChatPage) {
			setTimeout(function() {
				window.location.href = <?php echo json_encode(esc_js(home_url('/login/'))); ?>;
			}, 500);
		}
	}

	navigator.serviceWorker.addEventListener('message', function(event) {
		if (event.data.type === 'NOTIFICATION_CLICK') {
			if (event.data.channelId) {
				if (typeof switchChannel === 'function') {
					switchChannel(parseInt(event.data.channelId));
				}

				if (event.data.messageId) {
					setTimeout(function() {
						const $message = $(`.chat-message[data-message-id="${event.data.messageId}"]`);
						if ($message.length) {
							$('.chat-messages').animate({
								scrollTop: $message.offset().top - $('.chat-messages').offset().top + $('.chat-messages').scrollTop()
							}, 500);
							$message.addClass('highlight-message');
							setTimeout(() => $message.removeClass('highlight-message'), 3000);
						}
					}, 500);
				}
			}
		}
	});

	document.addEventListener('DOMContentLoaded', function() {
		const menuButton = document.getElementById('chatMenuButton');
		const menuContent = document.getElementById('chatMenuContent');

		if (menuButton && menuContent) {
			menuButton.addEventListener('click', function(e) {
				e.preventDefault();
				menuContent.classList.toggle('show');
			});

			document.addEventListener('click', function(e) {
				if (!menuButton.contains(e.target) && !menuContent.contains(e.target)) {
					menuContent.classList.remove('show');
				}
			});

			document.addEventListener('keydown', function(e) {
				if (e.key === 'Escape' && menuContent.classList.contains('show')) {
					menuContent.classList.remove('show');
				}
			});

			menuButton.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					menuContent.classList.toggle('show');
				}
			});
		}

		const updateNotificationButtonStyle = function() {
			const notifButton = document.getElementById('enableNotificationsButton');
			if (notifButton) {
				if (Notification.permission === 'granted') {
					notifButton.classList.add('enabled');
					notifButton.querySelector('span').textContent = 'プッシュ通知は有効です';
				} else {
					notifButton.classList.remove('enabled');
					notifButton.querySelector('span').textContent = 'プッシュ通知を有効にする';
				}
			}
		};

		updateNotificationButtonStyle();

		const enableNotificationsButton = document.getElementById('enableNotificationsButton');
		if (enableNotificationsButton) {
			enableNotificationsButton.addEventListener('click', async function(e) {
				e.preventDefault();
				if (window.pushNotification && typeof window.pushNotification.setupPushSubscription === 'function') {
					await window.pushNotification.setupPushSubscription();
					updateNotificationButtonStyle();
					menuContent.classList.remove('show');
				}
			});

			if ('Notification' in window) {
				setInterval(updateNotificationButtonStyle, 2000);
			}
		}

		const channelItems = document.querySelectorAll('.channel-item');

		channelItems.forEach(item => {
			item.addEventListener('click', function() {
				const channelId = this.getAttribute('data-channel-id');
				const channelType = this.getAttribute('data-channel-type');

				const iconContainer = document.querySelector('.channel-header-icon');
				const hashIcon = document.querySelector('.channel-header-icon .icon-hash');
				const lockIcon = document.querySelector('.channel-header-icon .icon-lock');

				if (channelType === 'public') {
					iconContainer.style.display = 'flex';
					hashIcon.style.display = 'block';
					lockIcon.style.display = 'none';
				} else if (channelType === 'private') {
					iconContainer.style.display = 'flex';
					hashIcon.style.display = 'none';
					lockIcon.style.display = 'block';
				}
			});
		});

		setTimeout(function() {
			ensureSearchButtonVisible();

			setTimeout(ensureSearchButtonVisible, 500);

			setTimeout(ensureSearchButtonVisible, 1000);

			setInterval(ensureSearchButtonVisible, 100);
		}, 100);

		function ensureSearchButtonVisible() {
			const searchBtn = document.getElementById('chat-search-button');
			if (searchBtn) {
				searchBtn.style.setProperty('display', 'flex', 'important');
				searchBtn.style.setProperty('visibility', 'visible', 'important');
				searchBtn.style.setProperty('opacity', '1', 'important');
				searchBtn.style.setProperty('position', 'absolute', 'important');
				searchBtn.style.setProperty('left', '10px', 'important');
				searchBtn.style.setProperty('top', '50%', 'important');
				searchBtn.style.setProperty('transform', 'translateY(-50%)', 'important');
				searchBtn.style.setProperty('z-index', '9999', 'important');
				searchBtn.style.setProperty('width', '20px', 'important');
				searchBtn.style.setProperty('height', '20px', 'important');

				if (!searchBtn._hasClickHandler) {
					searchBtn.addEventListener('click', function(e) {
						setTimeout(function() {
							ensureSearchButtonVisible();
						}, 10);
					});
					searchBtn._hasClickHandler = true;
				}

				const svgIcon = searchBtn.querySelector('svg');
				if (svgIcon) {
					svgIcon.style.setProperty('opacity', '1', 'important');
					svgIcon.style.setProperty('visibility', 'visible', 'important');
					svgIcon.style.setProperty('display', 'block', 'important');
				}
			}
		}

		function setupMutationObserver() {
			const searchBtn = document.getElementById('chat-search-button');
			if (!searchBtn) return;

			if (searchBtn._hasMutationObserver) return;

			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'attributes' &&
						(mutation.attributeName === 'style' ||
							mutation.attributeName === 'class' ||
							mutation.attributeName === 'hidden')) {
						ensureSearchButtonVisible();
					}
				});
			});

			observer.observe(searchBtn, {
				attributes: true,
				attributeFilter: ['style', 'class', 'hidden']
			});

			searchBtn._hasMutationObserver = true;
			return observer;
		}

		setTimeout(setupMutationObserver, 500);

		const waitForSearchObject = setInterval(function() {
			if (window.LMSChat && window.LMSChat.search && typeof window.LMSChat.search.ensureSearchButtonVisible === 'function') {
				window.LMSChat.search.ensureSearchButtonVisible();
				document.addEventListener('click', function(e) {
					setTimeout(function() {
						window.LMSChat.search.ensureSearchButtonVisible();
						ensureSearchButtonVisible();
					}, 100);
				});
				clearInterval(waitForSearchObject);
			}
		}, 200);

		const searchInput = document.getElementById('chat-search-input');
		if (searchInput) {
			searchInput.addEventListener('focus', ensureSearchButtonVisible);
			searchInput.addEventListener('click', ensureSearchButtonVisible);

			const wrapper = searchInput.closest('.search-input-wrapper');
			if (wrapper) {
				wrapper.addEventListener('click', function() {
					setTimeout(ensureSearchButtonVisible, 50);
				});
			}
		}
	});
</script>

<style>
	.chat-search-button,
	#chat-search-button {
		position: absolute !important;
		left: 10px !important;
		top: 50% !important;
		transform: translateY(-50%) !important;
		background: none !important;
		border: none !important;
		padding: 0 !important;
		cursor: pointer !important;
		color: #666 !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
		height: 20px !important;
		width: 20px !important;
		min-width: 20px !important;
		line-height: 1 !important;
		z-index: 10 !important;
		opacity: 1 !important;
		visibility: visible !important;
		pointer-events: auto !important;
	}

	.chat-search-button:hover,
	#chat-search-button:hover {
		color: #333 !important;
	}

	.chat-search-button svg,
	#chat-search-button svg {
		vertical-align: middle !important;
		width: 16px !important;
		height: 16px !important;
		opacity: 0.8 !important;
	}

	.chat-search-button svg:hover,
	#chat-search-button svg:hover {
		opacity: 1 !important;
	}

	.chat-search-input,
	#chat-search-input {
		padding-left: 35px !important;
	}
</style>

<div class="chat-element-hidden">
	<svg id="icon-file" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
	</svg>
	<svg id="icon-image" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" />
	</svg>
	<svg id="icon-video" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
	</svg>
	<svg id="icon-audio" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
		<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
	</svg>
</div>
