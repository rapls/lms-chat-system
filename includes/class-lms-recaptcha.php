<?php

/**
 * reCAPTCHA v3機能を管理するクラス
 *
 * @package LMS Theme
 */
class LMS_ReCAPTCHA
{
	private static $instance = null;
	private $site_key;
	private $secret_key;
	private $is_enabled;
	private $target_pages = array('/login/', '/register/', '/reset-password/');
	private $target_actions = array('login', 'register', 'reset-password'); // 検証対象のアクション
	private $score_threshold = 0.5; // reCAPTCHA v3のスコアしきい値

	private function __construct()
	{
		$this->is_enabled = get_option('recaptcha_enabled', '0') === '1';
		$this->site_key = get_option('recaptcha_site_key', '');
		$this->secret_key = get_option('recaptcha_secret_key', '');

		add_action('wp_enqueue_scripts', array($this, 'enqueue_recaptcha_scripts'));

		add_action('wp_footer', array($this, 'add_recaptcha_badge'));

		add_filter('lms_login_validation', array($this, 'validate_recaptcha'));
		add_filter('lms_register_validation', array($this, 'validate_recaptcha'));
		add_filter('lms_reset_password_validation', array($this, 'validate_recaptcha'));
	}

	public static function get_instance()
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * reCAPTCHAスクリプトを読み込む
	 */
	public function enqueue_recaptcha_scripts()
	{
		if (!$this->is_enabled) {
			return;
		}

		if (empty($this->site_key) || empty($this->secret_key)) {
			return;
		}

		$current_page = $_SERVER['REQUEST_URI'];
		$is_target_page = false;
		foreach ($this->target_pages as $page) {
			if (strpos($current_page, $page) !== false) {
				$is_target_page = true;
				break;
			}
		}

		if ($is_target_page) {
			wp_enqueue_script(
				'google-recaptcha',
				'https://www.google.com/recaptcha/api.js?render=' . esc_attr($this->site_key),
				array(),
				null,
				true
			);

			wp_add_inline_script('google-recaptcha', '
				function executeRecaptcha(action) {
					return new Promise((resolve, reject) => {
						grecaptcha.ready(function() {
							grecaptcha.execute("' . esc_attr($this->site_key) . '", {action: action})
								.then(function(token) {
									resolve(token);
								})
								.catch(function(error) {
									reject(error);
								});
						});
					});
				}

				document.addEventListener("DOMContentLoaded", function() {
					const forms = document.querySelectorAll("form.lms-auth-form");
					forms.forEach(function(form) {
						const action = form.getAttribute("data-action");
						if (["login", "register", "reset-password"].includes(action)) {
							const originalSubmit = form.onsubmit;
							form.onsubmit = async function(e) {
								e.preventDefault();
								try {
									const token = await executeRecaptcha(action);
									const input = document.createElement("input");
									input.type = "hidden";
									input.name = "g-recaptcha-response";
									input.value = token;
									form.appendChild(input);

									if (originalSubmit && typeof originalSubmit === "function") {
										const result = originalSubmit.call(this, e);
										if (result === false) return false;
									}

									form.submit();
								} catch (error) {
								}
							};
						}
					});
				});
			');
		}
	}

	/**
	 * reCAPTCHAバッジをフッターに追加
	 */
	public function add_recaptcha_badge()
	{
		if (!$this->is_enabled) {
			return;
		}

		if (empty($this->site_key) || empty($this->secret_key)) {
			return;
		}

		$current_page = $_SERVER['REQUEST_URI'];
		$is_target_page = false;
		foreach ($this->target_pages as $page) {
			if (strpos($current_page, $page) !== false) {
				$is_target_page = true;
				break;
			}
		}

		if ($is_target_page) {
			echo '<div class="grecaptcha-badge"></div>';
		}
	}

	/**
	 * reCAPTCHAの検証
	 *
	 * @param array $validation バリデーション結果
	 * @return array 更新されたバリデーション結果
	 */
	public function validate_recaptcha($validation)
	{
		if (!$this->is_enabled) {
			return $validation;
		}

		if (empty($this->site_key) || empty($this->secret_key)) {
			return $validation;
		}

		$action = isset($_POST['action']) ? $_POST['action'] : '';
		if (!in_array($action, $this->target_actions)) {
			return $validation;
		}

		$recaptcha_response = isset($_POST['g-recaptcha-response']) ? $_POST['g-recaptcha-response'] : '';

		if (empty($recaptcha_response)) {
			$validation['success'] = false;
			$validation['errors'][] = 'reCAPTCHAの検証に失敗しました。';
			return $validation;
		}

		$verify_url = 'https://www.google.com/recaptcha/api/siteverify';
		$response = wp_remote_post($verify_url, array(
			'body' => array(
				'secret' => $this->secret_key,
				'response' => $recaptcha_response,
				'remoteip' => $_SERVER['REMOTE_ADDR']
			)
		));

		if (is_wp_error($response)) {
			$validation['success'] = false;
			$validation['errors'][] = 'reCAPTCHAの検証中にエラーが発生しました。';
			return $validation;
		}

		$result = json_decode(wp_remote_retrieve_body($response));

		if (!$result->success || $result->score < $this->score_threshold) {
			$validation['success'] = false;
			$validation['errors'][] = '不正なアクセスと判断されました。';
		}

		return $validation;
	}
}
