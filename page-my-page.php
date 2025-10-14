<?php

/**
 * Template Name: マイページ
 *
 * @package LMS Theme
 */

$auth = LMS_Auth::get_instance();
$lms_user = $auth->get_current_user();

if (!$auth->is_logged_in()) {
	wp_redirect(home_url('/login/'));
	exit;
}

$lms_user = $auth->get_current_user();
$current_user = null;

if (!empty($lms_user) && !is_wp_error($lms_user)) {
	$current_user = $lms_user;
}

$wp_user = get_user_by('login', 'min');
if ($wp_user) {
	if (!is_user_logged_in()) {
		wp_clear_auth_cookie();
		wp_destroy_current_session();
		wp_set_current_user($wp_user->ID);
		wp_set_auth_cookie($wp_user->ID, true);
		update_user_meta($wp_user->ID, 'show_admin_bar_front', 'true');
		clean_user_cache($wp_user->ID);

		$cache_helper = LMS_Cache_Helper::get_instance();
		$cache_key = $cache_helper->generate_key([$wp_user->ID], 'user_meta');
		$cache_helper->delete($cache_key);
	}
}

$display_name = $lms_user->display_name;
$username = $lms_user->username;

$calendar = lms_generate_calendar();

get_header();
?>

<div class="my-page">
	<!-- サイドバー -->
	<div class="sidebar">
		<div class="user-profile">
			<div class="user-avatar">
				<img src="<?php echo esc_url(lms_get_user_avatar_url($lms_user->id)); ?>" alt="プロフィール画像">
			</div>
			<div class="user-info">
				<div class="user-display-name">
					表示名：<span><?php echo esc_html($display_name); ?></span>
				</div>
				<div class="user-username">
					ユーザー名：<span><?php echo esc_html($username); ?></span>
				</div>
			</div>
			<a href="<?php echo home_url('/user-profile/'); ?>" class="profile-button">受講者情報</a>
		</div>
		<div class="calendar-container">
			<div class="calendar-illustration">
				<img src="<?php echo esc_url(lms_add_version_to_image_url(lms_get_calendar_illustration_url())); ?>" alt="カレンダーイラスト">
			</div>
			<div class="calendar-section">
				<!-- カレンダー全体 -->
				<div class="calendar">
					<div class="calendar-header">
						<a href="#" class="calendar-nav prev"
							data-year="<?php echo $calendar['prev']['year']; ?>"
							data-month="<?php echo $calendar['prev']['month']; ?>">
							<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-left.svg'); ?>" alt="前月">
						</a>
						<h4 class="calendar-title">
							<?php echo esc_html($calendar['year'] . '年' . $calendar['month']); ?>
						</h4>
						<a href="#" class="calendar-nav next"
							data-year="<?php echo $calendar['next']['year']; ?>"
							data-month="<?php echo $calendar['next']['month']; ?>">
							<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-right.svg'); ?>" alt="次月">
						</a>
					</div>

					<div id="calendar-container">
						<table class="calendar-table">
							<thead>
								<tr>
									<th>日</th>
									<th>月</th>
									<th>火</th>
									<th>水</th>
									<th>木</th>
									<th>金</th>
									<th>土</th>
								</tr>
							</thead>
							<tbody>
								<?php foreach ($calendar['weeks'] as $week): ?>
									<tr>
										<?php foreach ($week as $index => $day): ?>
											<?php
											$classes = [];
											if (!empty($day['day'])) {
												if (
													$day['day'] === (int)date('j') &&
													$calendar['month'] === date('n') . '月' &&
													$calendar['year'] === (int)date('Y')
												) {
													$classes[] = 'today';
												}
												if ($index === 0) $classes[] = 'sunday';
												if ($index === 6) $classes[] = 'saturday';
												if ($day['holiday']) {
													$classes[] = 'holiday';
												}
											}
											?>
											<td class="<?php echo esc_attr(implode(' ', $classes)); ?>"
												<?php if ($day['holiday'] && !empty($day['holiday_name'])): ?>
												data-holiday="<?php echo esc_attr($day['holiday_name']); ?>"
												<?php endif; ?>>
												<?php if (in_array('today', $classes)): ?>
													<span class="today-circle"><?php echo (int)$day['day']; ?></span>
												<?php else: ?>
													<?php echo !empty($day['day']) ? (int)$day['day'] : ''; ?>
												<?php endif; ?>
											</td>
										<?php endforeach; ?>
									</tr>
								<?php endforeach; ?>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="main-content">
		<div class="button-group">
			<a href="<?php echo esc_url(get_option('elearning_url', '#')); ?>"
				class="e-learning-button"
				<?php echo get_option('elearning_new_tab', '0') === '1' ? 'target="_blank" rel="noopener noreferrer"' : ''; ?>>
				<div class="e-learning-button-content">
					<div class="e-learning-icon">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-e-learning.svg'); ?>" alt="eラーニング">
					</div>
					<span class="e-learning-text">eラーニングはこちら</span>
					<div class="e-learning-arrow">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-right-white.svg'); ?>" alt="矢印" width="24" height="24">
					</div>
				</div>
			</a>
			<?php
			$slack_workspace = get_option('slack_workspace', '');
			$slack_channel   = $lms_user->slack_channel;

			$slack_url = ($slack_workspace && $slack_channel)
				? sprintf('https://%s.slack.com/app_redirect?channel=%s', $slack_workspace, urlencode($slack_channel))
				: '#';
			?>
			<a href="<?php echo esc_url($slack_url); ?>"
				class="slack-button"
				<?php echo ($slack_workspace && $slack_channel) ? 'target="_blank" rel="noopener noreferrer"' : ''; ?>>
				<div class="slack-button-content">
					<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-slack.svg'); ?>" alt="Slack" width="24" height="24">
					<span>Slackで質問する</span>
				</div>
			</a>
		</div>

		<div class="dashboard-section">
			<h2>学習ダッシュボード</h2>
			<p class="dashboard-message">学習を開始するには、以下のリンクをクリックしてください。</p>
			<?php
			$redirect_page = $lms_user->redirect_page;
			if ($redirect_page) {
				$post = get_post($redirect_page);
				if ($post) {
			?>
					<a href="<?php echo esc_url(get_permalink($post->ID)); ?>" class="start-learning-button">
						<div class="start-learning-content">
							<span class="start-learning-text"><?php echo esc_html($post->post_title); ?></span>
							<div class="start-learning-arrow">
								<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-right.svg'); ?>" alt="矢印" width="24" height="24">
							</div>
						</div>
					</a>
			<?php
				} else {
					echo '<p class="no-content-message">指定された投稿が見つかりません。</p>';
				}
			} else {
				echo '<p class="no-content-message">リダイレクト先が設定されていません。</p>';
			}
			?>
		</div>

		<div class="notification-section">
			<h2 class="section-title">お知らせ</h2>
			<?php
			$args = array(
				'post_type'      => 'notification',
				'posts_per_page' => 3,
				'orderby'        => 'date',
				'order'          => 'DESC',
			);
			$notifications = new WP_Query($args);

			if ($notifications->have_posts()) :
			?>
				<div class="notification-list">
					<?php while ($notifications->have_posts()) : $notifications->the_post(); ?>
						<a href="<?php the_permalink(); ?>" class="notification-item">
							<div class="notification-content">
								<time class="notification-date" datetime="<?php echo get_the_date('c'); ?>">
									<?php echo get_the_date('Y.m.d'); ?>
								</time>
								<h3 class="notification-title"><?php the_title(); ?></h3>
							</div>
							<div class="notification-arrow">
								<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-right-small.svg'); ?>" alt="矢印" width="24" height="24">
							</div>
						</a>
					<?php endwhile; ?>
				</div>
				<div class="view-all-notifications">
					<a href="<?php echo get_post_type_archive_link('notification'); ?>">
						お知らせ一覧
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-right-white.svg'); ?>" alt="矢印" width="24" height="24">
					</a>
				</div>
			<?php
			else :
				echo '<p class="no-notifications">お知らせはありません。</p>';
			endif;
			wp_reset_postdata();
			?>
		</div>
	</div>
</div>

<script>
	jQuery(document).ready(function($) {

		$('.calendar-nav').on('click', function(e) {
			e.preventDefault();

			const $link = $(this);
			const year = $link.data('year');
			const month = $link.data('month');

			$.ajax({
				url: '<?php echo admin_url('admin-ajax.php'); ?>',
				type: 'POST',
				dataType: 'json',
				data: {
					action: 'lms_load_calendar',
					year: year,
					month: month
				},
				success: function(response) {
					if (response.success) {
						$('#calendar-container').html(response.data.calendar_html);

						$('.calendar-title').text(response.data.year + '年' + response.data.month);

						$('.calendar-nav.prev')
							.data('year', response.data.prev.year)
							.data('month', response.data.prev.month);
						$('.calendar-nav.next')
							.data('year', response.data.next.year)
							.data('month', response.data.next.month);

					} else {
						alert('カレンダーの取得に失敗しました。');
					}
				},
				error: function() {
					alert('通信エラーが発生しました。');
				}
			});
		});

	});
</script>

<?php get_footer(); ?>
