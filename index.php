<?php

/**
 * メインテンプレート
 *
 * @package LMS Theme
 */

get_header();

$auth = LMS_Auth::get_instance();
?>

<main id="primary" class="site-main">
	<div class="container">
		<?php if ($auth->is_logged_in()) : ?>
			<?php
			$current_user = $auth->get_current_user();
			?>
			<div class="welcome-section">
				<h1><?php printf(esc_html__('ようこそ、%sさん', 'lms-theme'), esc_html($current_user->display_name)); ?></h1>
				<p class="welcome-message">
					<?php esc_html_e('学習を開始するには、以下のリンクをクリックしてください。', 'lms-theme'); ?>
				</p>
				<?php if (!empty($current_user->redirect_page)) : ?>
					<?php $redirect_url = get_permalink($current_user->redirect_page); ?>
					<?php if ($redirect_url) : ?>
						<div class="learning-link">
							<a href="<?php echo esc_url($redirect_url); ?>" class="button button-primary">
								<?php echo esc_html(get_the_title($current_user->redirect_page)); ?>
							</a>
						</div>
					<?php endif; ?>
				<?php else : ?>
					<p class="notice">
						<?php esc_html_e('リダイレクト先が設定されていません。管理者に連絡してください。', 'lms-theme'); ?>
					</p>
				<?php endif; ?>
			</div>
		<?php else : ?>
			<div class="login-section">
				<h1><?php esc_html_e('学習支援システムへようこそ', 'lms-theme'); ?></h1>
				<p class="login-message">
					<?php esc_html_e('学習を開始するには、ログインまたは新規登録を行ってください。', 'lms-theme'); ?>
				</p>
				<div class="login-buttons">
					<a href="<?php echo esc_url(home_url('/login/')); ?>" class="button button-primary">
						<?php esc_html_e('ログイン', 'lms-theme'); ?>
					</a>
					<a href="<?php echo esc_url(home_url('/register/')); ?>" class="button button-secondary">
						<?php esc_html_e('新規登録', 'lms-theme'); ?>
					</a>
				</div>
			</div>
		<?php endif; ?>
	</div>
</main>

<style>
	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2em;
	}

	.welcome-section,
	.login-section {
		text-align: center;
		padding: 3em 0;
	}

	h1 {
		font-size: 2em;
		color: #333;
		margin-bottom: 1em;
	}

	.welcome-message,
	.login-message {
		font-size: 1.1em;
		color: #666;
		margin-bottom: 2em;
		line-height: 1.6;
	}

	.notice {
		color: #856404;
		background-color: #fff3cd;
		border: 1px solid #ffeeba;
		padding: 1em;
		border-radius: 4px;
		margin: 1em 0;
	}

	.learning-link,
	.login-buttons {
		margin-top: 2em;
		display: flex;
		justify-content: center;
		gap: 1em;
	}

	.button {
		display: inline-block;
		padding: 0.8em 1.5em;
		font-size: 1.1em;
		text-decoration: none;
		border-radius: 4px;
		transition: all 0.3s ease;
		min-width: 160px;
		text-align: center;
		white-space: nowrap;
	}

	.button-primary {
		background: #1890ff;
		color: #fff;
		border: none;
	}

	.button-primary:hover {
		background: #096dd9;
		transform: translateY(-1px);
	}

	.button-secondary {
		background: #f5f5f5;
		color: #666;
		border: 1px solid #d9d9d9;
	}

	.button-secondary:hover {
		background: #e8e8e8;
		color: #333;
	}

	@media (max-width: 480px) {
		.container {
			padding: 1em;
		}

		.learning-link,
		.login-buttons {
			flex-direction: column;
			gap: 1em;
		}

		.button {
			width: 100%;
			min-width: auto;
		}
	}
</style>

<?php
get_footer();
