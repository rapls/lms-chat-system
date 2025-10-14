<?php

/**
 * 投稿コンテンツのテンプレート
 *
 * @package LMS Theme
 */
?>

<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
	<header class="entry-header">
		<?php
		if (is_singular()) :
			the_title('<h1 class="entry-title">', '</h1>');
		else :
			the_title('<h2 class="entry-title"><a href="' . esc_url(get_permalink()) . '" rel="bookmark">', '</a></h2>');
		endif;

		if ('post' === get_post_type()) :
		?>
			<div class="entry-meta">
				<span class="posted-on">
					<?php echo esc_html('投稿日: '); ?>
					<?php echo get_the_date(); ?>
				</span>
				<span class="byline">
					<?php echo esc_html('投稿者: '); ?>
					<?php the_author(); ?>
				</span>
			</div>
		<?php endif; ?>
	</header>

	<?php if (has_post_thumbnail() && !is_singular()) : ?>
		<div class="post-thumbnail">
			<a href="<?php the_permalink(); ?>">
				<?php the_post_thumbnail('medium'); ?>
			</a>
		</div>
	<?php endif; ?>

	<div class="entry-content">
		<?php
		if (is_singular()) :
			the_content();
		else :
			the_excerpt();
			echo '<p class="read-more"><a href="' . esc_url(get_permalink()) . '" class="more-link">' . esc_html('続きを読む') . '</a></p>';
		endif;
		?>
	</div>

	<footer class="entry-footer">
		<?php
		$categories_list = get_the_category_list(esc_html__(', '));
		if ($categories_list) {
			printf('<span class="cat-links">%s %s</span>', esc_html('カテゴリー: '), $categories_list);
		}

		$tags_list = get_the_tag_list('', esc_html__(', '));
		if ($tags_list) {
			printf('<span class="tags-links">%s %s</span>', esc_html('タグ: '), $tags_list);
		}
		?>
	</footer>
</article>
