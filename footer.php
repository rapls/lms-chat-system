<?php

/**
 * フッターテンプレート
 *
 * @package LMS Theme
 */
?>

</div><!-- #content -->

<footer id="colophon" class="site-footer">
	<div class="footer-container">
		<div class="footer-menu">
			<nav class="footer-navigation">
				<?php
				if (has_nav_menu('footer')) {
					wp_nav_menu(array(
						'theme_location' => 'footer',
						'menu_class'     => 'footer-menu-list',
						'container'      => false,
						'depth'          => 1,
						'fallback_cb'    => false,
					));
				}
				?>
			</nav>
		</div>
		<div class="site-info">
			<p>&copy; <?php echo date('Y'); ?> SHAKE SPACE All rights reserved.</p>
		</div>
	</div>
</footer>
</div><!-- #page -->

<!-- メディアプレビュー・再生モーダル -->
<div id="media-preview-modal" class="media-modal" style="display: none;">
	<div class="media-modal-overlay"></div>
	<div class="media-modal-container">
		<div class="media-modal-header">
			<h3 class="media-modal-title">メディアプレビュー</h3>
			<button class="media-modal-close" aria-label="閉じる">&times;</button>
		</div>
		<div class="media-preview-content"></div>
	</div>
</div>

<?php wp_footer(); ?>

</body>

</html>
