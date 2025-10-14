<?php

/**
 * お知らせ詳細表示テンプレート
 *
 * @package LMS Theme
 */

get_header();
?>

<div class="notification-detail">
	<div class="notification-container">
		<?php while (have_posts()) : the_post(); ?>
			<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
				<header class="notification-header">
					<div class="notification-meta">
						<time class="notification-date" datetime="<?php echo get_the_date('c'); ?>">
							<?php echo get_the_date('Y.m.d'); ?>
						</time>
						<?php
						$categories = get_the_terms(get_the_ID(), 'notification_cat');
						if ($categories && !is_wp_error($categories)) :
							$category = array_shift($categories);
						?>
							<span class="notification-category"><?php echo esc_html($category->name); ?></span>
						<?php endif; ?>
					</div>
					<h1 class="notification-title"><?php the_title(); ?></h1>
				</header>

				<div class="notification-content">
					<?php the_content(); ?>
				</div>

				<?php if (has_post_thumbnail()) : ?>
					<div class="notification-thumbnail">
						<?php the_post_thumbnail('large'); ?>
					</div>
				<?php endif; ?>

				<footer class="notification-footer">
					<div class="notification-navigation">
						<?php
						$prev_post = get_previous_post();
						$next_post = get_next_post();
						?>
						<?php if ($prev_post) : ?>
							<a href="<?php echo get_permalink($prev_post); ?>" class="nav-previous">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
								<span>前の記事</span>
							</a>
						<?php endif; ?>
						<a href="<?php echo home_url('/my-page/'); ?>" class="nav-to-mypage">
							マイページ
						</a>
						<a href="<?php echo get_post_type_archive_link('notification'); ?>" class="nav-to-archive">
							お知らせ一覧
							<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-arrow-right-white.svg'); ?>" alt="矢印" width="20" height="20">
						</a>
						<?php if ($next_post) : ?>
							<a href="<?php echo get_permalink($next_post); ?>" class="nav-next">
								<span>次の記事</span>
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</a>
						<?php endif; ?>
					</div>
				</footer>
			</article>
		<?php endwhile; ?>
	</div>
</div>

<?php get_footer(); ?>
