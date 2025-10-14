(function ($) {
	'use strict';
	
	if (window.UnifiedScrollManager) {
		return;
	}
	
	window.LMSChat = window.LMSChat || {};
	window.LMSChat.searchScroll = {};
	const showLoadingIndicator = (message = 'メッセージ読み込み中') => {
		if (window.LMSChat?.scrollUtils?.showLoader) {
			return window.LMSChat.scrollUtils.showLoader(null, message);
		}
		return $('<div>Loading...</div>');
	};
	
	const hideLoadingIndicator = () => {
		if (window.LMSChat?.scrollUtils?.hideLoader) {
			return window.LMSChat.scrollUtils.hideLoader();
		}
		$('.loading-indicator').fadeOut(200);
	};
	window.LMSChat.searchScroll.showLoadingIndicator = showLoadingIndicator;
	window.LMSChat.searchScroll.hideLoadingIndicator = hideLoadingIndicator;
	$(document).ready(() => {
		$(document).on('scroll_utils_loaded', function () {
		});
	});
})(jQuery);
