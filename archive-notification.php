<?php

/**
 * お知らせアーカイブページテンプレート
 *
 * @package LMS Theme
 */

get_header();
?>

<div class="archive-notification">
	<div class="archive-container">
		<h1 class="archive-title">お知らせ一覧</h1>

		<?php if (have_posts()) : ?>
			<div class="notification-grid">
				<?php while (have_posts()) : the_post(); ?>
					<a href="<?php the_permalink(); ?>" class="notification-card">
						<time class="notification-date" datetime="<?php echo get_the_date('c'); ?>">
							<?php echo get_the_date('Y.m.d'); ?>
						</time>
						<h2 class="notification-title"><?php the_title(); ?></h2>
						<?php if (has_excerpt()) : ?>
							<div class="notification-excerpt">
								<?php echo wp_trim_words(get_the_excerpt(), 50); ?>
							</div>
						<?php endif; ?>
						<div class="notification-more">
							続きを読む
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</div>
					</a>
				<?php endwhile; ?>
			</div>

			<?php
			the_posts_pagination(array(
				'prev_text' => '前のページ',
				'next_text' => '次のページ',
				'mid_size'  => 2,
			));
			?>

		<?php else : ?>
			<p class="no-posts">お知らせはありません。</p>
		<?php endif; ?>

		<div class="archive-footer">
			<a href="<?php echo home_url('/my-page/'); ?>" class="back-to-mypage">
				マイページへ戻る
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</a>
		</div>
	</div>
</div>

<?php get_footer(); ?>
