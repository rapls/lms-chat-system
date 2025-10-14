<?php

/**
 * ヘッダーテンプレート
 *
 * @package LMS Theme
 */

$auth = LMS_Auth::get_instance();
$current_user = $auth->is_logged_in() ? $auth->get_current_user() : null;
?>
<!doctype html>
<html <?php language_attributes(); ?>>

<head>
	<meta charset="<?php bloginfo('charset'); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<link rel="profile" href="https://gmpg.org/xfn/11">
	
	<?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
	<?php wp_body_open(); ?>

	<div id="page" class="site">
		<header id="masthead" class="site-header">
			<div class="header-container">
				<div class="site-branding">
					<?php if (is_front_page() && is_home()) : ?>
						<h1 class="site-title">
							<a href="<?php echo esc_url(home_url('/')); ?>" rel="home">
								<img src="<?php echo esc_url(get_template_directory_uri() . '/img/logo.png'); ?>" alt="<?php bloginfo('name'); ?>" class="site-logo">
							</a>
						</h1>
					<?php else : ?>
						<p class="site-title">
							<a href="<?php echo esc_url(home_url('/')); ?>" rel="home">
								<img src="<?php echo esc_url(get_template_directory_uri() . '/img/logo.png'); ?>" alt="<?php bloginfo('name'); ?>" class="site-logo">
							</a>
						</p>
					<?php endif; ?>
				</div>

				<?php if ($current_user) : ?>
					<div class="chat-icon-wrapper">
						<a href="<?php echo esc_url(home_url('/chat/')); ?>" class="chat-icon">
							<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-chat.svg'); ?>" alt="チャット">
							<span class="unread-badge"></span>
						</a>
					</div>

					<div class="user-menu-wrapper">
						<button type="button" class="user-menu-button" aria-expanded="false" aria-controls="user-menu">
							<div class="user-avatar2">
								<img src="<?php echo esc_url(lms_get_user_avatar_url($current_user->id)); ?>" alt="プロフィール画像">
							</div>
						</button>

						<div id="user-menu" class="user-menu" role="menu">
							<div class="user-info">
								<span class="user-name"><?php echo esc_html($current_user->display_name); ?></span>
								<span class="user-type">
									<?php
									$user_type_labels = array(
										'student' => '受講者',
										'teacher' => '講師',
										'admin' => '管理者'
									);

									echo esc_html($user_type_labels[$current_user->user_type] ?? '受講者');
									?>
								</span>
							</div>
							<ul>
								<li>
									<a href="<?php echo esc_url(home_url('/my-page/')); ?>" role="menuitem">
										<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-home.svg'); ?>" alt="">
										マイページ
									</a>
								</li>
								<li>
									<a href="<?php echo esc_url(home_url('/user-profile/')); ?>" role="menuitem">
										<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-user.svg'); ?>" alt="">
										<?php
										$profile_labels = array(
											'student' => '受講者情報',
											'teacher' => '講師情報',
											'admin' => '管理者情報'
										);
										echo esc_html($profile_labels[$current_user->user_type] ?? '受講者情報');
										?>
									</a>
								</li>
								<li class="divider"></li>
								<li>
									<a href="<?php echo esc_url(add_query_arg('action', 'logout', home_url('/login/'))); ?>" class="logout" role="menuitem">
										<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-logout.svg'); ?>" alt="">
										ログアウト
									</a>
								</li>
							</ul>
						</div>
					</div>

					<script>
						document.addEventListener('DOMContentLoaded', function() {
							const menuButton = document.querySelector('.user-menu-button');
							const menu = document.querySelector('.user-menu');
							const arrow = document.querySelector('.dropdown-arrow');

							if (menuButton && menu) {
								menuButton.addEventListener('click', function(e) {
									e.stopPropagation();
									const isExpanded = menuButton.getAttribute('aria-expanded') === 'true';
									menuButton.setAttribute('aria-expanded', !isExpanded);
									menu.classList.toggle('show');
									if (arrow) {
										arrow.classList.toggle('open');
									}
								});

								document.addEventListener('click', function(e) {
									if (!menu.contains(e.target) && !menuButton.contains(e.target)) {
										menuButton.setAttribute('aria-expanded', 'false');
										menu.classList.remove('show');
										if (arrow) {
											arrow.classList.remove('open');
										}
									}
								});

								document.addEventListener('keydown', function(e) {
									if (e.key === 'Escape' && menu.classList.contains('show')) {
										menuButton.setAttribute('aria-expanded', 'false');
										menu.classList.remove('show');
										if (arrow) {
											arrow.classList.remove('open');
										}
									}
								});
							}
						});
					</script>

					<?php if (!is_page('chat')) : ?>
						<script>
							window.lmsChat = {
								ajaxUrl: '<?php echo esc_js(admin_url('admin-ajax.php')); ?>',
								nonce: '<?php echo esc_js(wp_create_nonce('lms_chat_nonce')); ?>',
								currentUserId: <?php echo esc_js($current_user->id); ?>,
								templateUrl: '<?php echo esc_js(get_template_directory_uri()); ?>'
							};
						</script>
					<?php endif; ?>
				<?php endif; ?>
			</div>
		</header>

		<div id="content" class="site-content">
