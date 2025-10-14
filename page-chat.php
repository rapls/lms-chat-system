<?php

/**
 * Template Name: チャット
 * Template Post Type: page
 *
 * チャット機能のメインテンプレートファイル
 *
 * @package LMS Theme
 */

get_header();
?>

<div id="primary" class="content-area">
	<main id="main" class="site-main">
		<?php get_template_part('template-parts/content', 'chat'); ?>
	</main>
</div>

<?php
get_footer();
