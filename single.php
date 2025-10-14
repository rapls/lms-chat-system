<?php

/**
 * 投稿詳細表示テンプレート
 *
 * @package LMS Theme
 */

get_header();
?>

<div class="post-detail">
	<div class="post-container">
		<?php while (have_posts()) : the_post(); ?>
			<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
				<?php if (has_post_thumbnail()) : ?>
					<div class="post-hero">
						<?php the_post_thumbnail('full', array('class' => 'post-hero-image')); ?>
					</div>
				<?php endif; ?>

				<div class="post-main">
					<header class="post-header">
						<div class="post-meta">
							<time class="post-date" datetime="<?php echo get_the_date('c'); ?>">
								<?php echo get_the_date('Y.m.d'); ?>
							</time>
							<?php
							$categories = get_the_category();
							if ($categories) :
								$category = array_shift($categories);
							?>
								<span class="post-category">
									<?php echo esc_html($category->name); ?>
								</span>
							<?php endif; ?>
						</div>
						<h1 class="post-title"><?php the_title(); ?></h1>
						<?php if (has_excerpt()) : ?>
							<div class="post-excerpt">
								<?php the_excerpt(); ?>
							</div>
						<?php endif; ?>
					</header>

					<div class="post-content">
						<?php the_content(); ?>

						<?php
						wp_link_pages(array(
							'before' => '<div class="page-links">',
							'after'  => '</div>',
						));
						?>
					</div>

					<?php if (has_tag()) : ?>
						<div class="post-tags">
							<?php the_tags('<span class="tag-label">タグ:</span> ', ' '); ?>
						</div>
					<?php endif; ?>

					<footer class="post-footer">
						<a href="<?php echo home_url('/my-page/'); ?>" class="back-to-mypage">
							マイページへ戻る
						</a>
					</footer>
				</div>
			</article>
		<?php endwhile; ?>
	</div>
</div>

<?php get_footer(); ?>
