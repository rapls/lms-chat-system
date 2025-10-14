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

<?php wp_footer(); ?>

</body>

</html>
