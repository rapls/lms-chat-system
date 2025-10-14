<?php

/**
 * 404エラーページテンプレート
 *
 * @package LMS Theme
 */

get_header();
?>

<div class="error-404">
	<div class="error-container">
		<div class="error-image">
			<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-404.svg'); ?>" alt="404 Not Found" width="300" height="200">
		</div>
		<h1 class="error-title">ページが見つかりません</h1>
		<div class="error-message">
			お探しのページは削除されたか、URLが変更された可能性があります。
		</div>
		<div class="error-actions">
			<a href="<?php echo esc_url(home_url('/')); ?>" class="button-primary">トップページへ</a>
			<a href="<?php echo esc_url(home_url('/my-page/')); ?>" class="button-secondary">マイページへ</a>
		</div>
		<div class="error-help">
			<p>お困りの場合は以下をお試しください：</p>
			<ul>
				<li>
					<a href="/contact/" class="help-link">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-support.svg'); ?>" alt="サポート" width="24" height="24">
						サポートへお問い合わせ
					</a>
				</li>
				<li>
					<a href="/faq/" class="help-link">
						<img src="<?php echo esc_url(get_template_directory_uri() . '/img/icon-faq.svg'); ?>" alt="FAQ" width="24" height="24">
						よくある質問を確認
					</a>
				</li>
			</ul>
		</div>
	</div>
</div>

<?php get_footer(); ?>
