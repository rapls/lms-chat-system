/**
 * LMS管理画面用JavaScript
 * プッシュ通知のテスト送信機能などを提供します
 */
(function ($) {
	'use strict';
	$('#lms-members-table').DataTable({
		language: {
			lengthMenu: '_MENU_件表示',
			info: '_TOTAL_件中 _START_～_END_件を表示',
			infoEmpty: '0件中 0～0件を表示',
			infoFiltered: '（全 _MAX_ 件より抽出）',
		},
		order: [[0, 'asc']],
		pageLength: 25,
		lengthMenu: [10, 25, 50, 100],
	});
	$('input[name^="slack_channel"]').on('change', function () {
		const userId = $(this)
			.attr('name')
			.match(/\[(\d+)\]/)[1];
		const slackChannel = $(this).val();
		$.ajax({
			url: ajaxurl,
			type: 'POST',
			data: {
				action: 'update_slack_channel',
				user_id: userId,
				slack_channel: slackChannel,
				nonce: lmsAdminVars.slackChannelNonce,
			},
			success: function (response) {
				if (response.success) {
				} else {
				}
			},
		});
	});
	var $editDialog = $('#edit-dialog').dialog({
		autoOpen: false,
		modal: true,
		width: 400,
		buttons: [
			{
				text: '保存',
				id: 'save-button',
				click: function () {
					var $dialog = $(this);
					var $form = $('#edit-form');
					if (!$form[0].checkValidity()) {
						return;
					}
					var formData = new FormData($form[0]);
					formData.append('action', 'edit_member');
					var $buttons = $dialog.parent().find('.ui-dialog-buttonpane button');
					$buttons.prop('disabled', true);
					var $messageEl = $(
						'<div class="save-message">保存中...<span class="spinner"></span></div>'
					);
					$form.append($messageEl);
					var ajaxUrl =
						typeof ajaxurl !== 'undefined'
							? ajaxurl
							: typeof lmsAdminVars !== 'undefined' && lmsAdminVars.ajaxurl
							? lmsAdminVars.ajaxurl
							: '/wp-admin/admin-ajax.php';
					var ajaxTimeout = setTimeout(function () {
						$messageEl.remove();
						$buttons.prop('disabled', false);
					}, 30000);
					$.ajax({
						url: ajaxUrl,
						type: 'POST',
						data: formData,
						processData: false,
						contentType: false,
						cache: false,
						timeout: 30000,
						success: function (response) {
							clearTimeout(ajaxTimeout);
							$messageEl.remove();
							if (response && response.success) {
								$dialog.dialog('close');
								alert(
									response.data && response.data.message
										? response.data.message
										: '更新が完了しました。'
								);
								location.reload();
							} else {
								var errorMsg =
									response && response.data && response.data.message
										? response.data.message
										: 'エラーが発生しました。';
								$buttons.prop('disabled', false);
							}
						},
						error: function (xhr, status, error) {
							clearTimeout(ajaxTimeout);
							$messageEl.remove();
							$buttons.prop('disabled', false);
						},
						complete: function () {
							clearTimeout(ajaxTimeout);
						},
					});
				},
			},
			{
				text: 'キャンセル',
				click: function () {
					$(this).dialog('close');
				},
			},
		],
		close: function () {
			$('#edit-form')[0].reset();
			$('#password-fields').hide();
			$('.save-message').remove();
			$(this).parent().find('.ui-dialog-buttonpane button').prop('disabled', false);
		},
	});
	$('#toggle-password-fields').on('click', function () {
		$('#password-fields').slideToggle();
		if ($('#password-fields').is(':visible')) {
			$(this).text('パスワード変更をキャンセル');
		} else {
			$(this).text('パスワードを変更');
			$('#edit-password, #edit-password-confirm').val('');
		}
	});
	$('.edit-member').on('click', function (e) {
		e.preventDefault();
		var $button = $(this);
		var userId = $button.data('user-id');
		var username = $button.data('username');
		var displayName = $button.data('display-name');
		var email = $button.data('email');
		$('#edit-user-id').val(userId);
		$('#edit-username').val(username);
		$('#edit-display-name').val(displayName);
		$('#edit-email').val(email);
		$editDialog.dialog('open');
	});
	$('.delete-member').on('click', function () {
		var userId = $(this).data('user-id');
		if (confirm('この会員を削除してもよろしいですか？\n\n※この操作は取り消せません。')) {
			$.ajax({
				url: ajaxurl,
				type: 'POST',
				data: {
					action: 'delete_member',
					user_id: userId,
					nonce: lmsAdminVars.editMemberNonce,
				},
				success: function (response) {
					if (response.success) {
						location.reload();
					} else {
					}
				},
				error: function () {
				},
			});
		}
	});
	$('#lms-members-form').on('submit', function (e) {
		e.preventDefault();
		var formData = $(this).serialize();
		$.ajax({
			url: ajaxurl,
			type: 'POST',
			data: formData + '&action=save_member_fields',
			success: function (response) {
				if (response.success) {
					location.reload();
				} else {
				}
			},
			error: function () {
			},
		});
	});
	const LMSAdmin = {
		/**
		 * 初期化
		 */
		init: function () {
			this.setupEventListeners();
		},
		/**
		 * イベントリスナーの設定
		 */
		setupEventListeners: function () {
			$('#send-test-notification').on('click', this.handleSendTestNotification);
		},
		/**
		 * テスト通知を送信する処理
		 * @param {Event} e イベントオブジェクト
		 */
		handleSendTestNotification: function (e) {
			e.preventDefault();
			const userId = $('#test-notification-user-id').val() || 2;
			const resultSpan = $('#test-notification-result');
			resultSpan.text('送信中...').css('color', '#666');
			$.ajax({
				url: lmsAdmin.ajaxUrl,
				type: 'POST',
				data: {
					action: 'lms_test_push_notification',
					user_id: userId,
					nonce: lmsAdmin.testNotificationNonce,
				},
				success: function (response) {
					if (response.success) {
						resultSpan.text('✅ ' + lmsAdmin.i18n.testNotificationSuccess).css('color', 'green');
						setTimeout(function () {
							resultSpan.text('');
						}, 5000);
					} else {
						const errorMessage =
							response.data && response.data.message
								? response.data.message
								: lmsAdmin.i18n.testNotificationError;
						resultSpan.text('❌ ' + errorMessage).css('color', 'red');
					}
				},
				error: function (xhr, status, error) {
					resultSpan.text('❌ ' + lmsAdmin.i18n.testNotificationError).css('color', 'red');
				},
			});
		},
	};
	$(document).ready(function () {
		if (typeof lmsAdmin !== 'undefined') {
			LMSAdmin.init();
		}
	});
})(jQuery);
