(function ($) {
	'use strict';
	
	if (window.UnifiedScrollManager) {
		window.LMSChat = window.LMSChat || {};
		window.LMSChat.scrollUtils = {
			showLoader: function(...args) {
				return window.UnifiedScrollManager.showLoader ? window.UnifiedScrollManager.showLoader(...args) : $('<div>Loading...</div>');
			},
			hideLoader: function(...args) {
				return window.UnifiedScrollManager.hideLoader ? window.UnifiedScrollManager.hideLoader(...args) : null;
			},
			lockScroll: function(...args) {
				return window.UnifiedScrollManager.lockScroll ? window.UnifiedScrollManager.lockScroll(...args) : null;
			},
			hideAllLoaders: function() {
				$('.loading-indicator, .global-loading-indicator, .scroll-loading-overlay, #scroll-lock-indicator').fadeOut(200).remove();
			}
		};
		return;
	}
	
	window.LMSChat = window.LMSChat || {};
	window.LMSChat.scrollUtils = {};
	const scrollState = {
		isLoading: false,
		isScrollLocked: false,
		scrollLockTimeout: null,
		loaderTimeout: null,
		scrollPosition: null,
		lastScrollTop: 0,
		scrollingDirection: 'none',
		loaderCreationAttempts: 0,
		maxLoaderCreationAttempts: 3,
	};
	const showLoader = (duration = null, loaderText = 'メッセージ読み込み中') => {
		$(document).trigger('loader_display_start');
		let $loader = $('.loading-indicator');
		const $messagesContainer = $('#chat-messages');
		if (
			$loader.length === 0 &&
			scrollState.loaderCreationAttempts < scrollState.maxLoaderCreationAttempts
		) {
			scrollState.loaderCreationAttempts++;
			$loader = $(`<div class="loading-indicator">${loaderText}</div>`);
			if ($messagesContainer.length > 0) {
				$messagesContainer.prepend($loader);
				scrollState.loaderCreationAttempts = 0;
			} else {
				$('body').append($loader);
			}
			if ($('.loading-indicator').length === 0) {
				if (scrollState.loaderCreationAttempts >= scrollState.maxLoaderCreationAttempts) {
				}
				setTimeout(() => {
					scrollState.loaderCreationAttempts = 0;
				}, 10000);
				return $({});
			}
		}
		if ($loader.length > 0) {
			$loader
				.text(loaderText)
				.css({
					opacity: 0,
					display: 'block',
				})
				.animate(
					{
						opacity: 1,
					},
					200
				);
		}
		if (scrollState.loaderTimeout) {
			clearTimeout(scrollState.loaderTimeout);
			scrollState.loaderTimeout = null;
		}
		if (duration !== null) {
			scrollState.loaderTimeout = setTimeout(() => {
				hideLoader();
			}, duration);
		}
		$(document).trigger('loader_display_complete', [$loader]);
		return $loader;
	};
	const hideLoader = () => {
		$(document).trigger('loader_hide_start');
		if (scrollState.loaderTimeout) {
			clearTimeout(scrollState.loaderTimeout);
			scrollState.loaderTimeout = null;
		}
		const $loader = $('.loading-indicator');
		if ($loader.length > 0) {
			$loader.stop().fadeOut(200, function () {
				$(document).trigger('loader_hide_complete');
			});
		} else {
			$(document).trigger('loader_hide_complete');
		}
	};
	const hideAllLoaders = () => {
		$(document).trigger('all_loaders_hide_start');
		$('.global-loading-indicator').fadeOut(200, function () {
			$(this).remove();
		});
		hideLoader();
		$('.scroll-loading-overlay').fadeOut(200, function () {
			$(this).remove();
		});
		$('#scroll-lock-indicator').fadeOut(200, function () {
			$(this).remove();
		});
		setTimeout(() => {
			$(document).trigger('all_loaders_hide_complete');
		}, 300);
	};
	const lockScroll = (lock = true, timeout = 30000) => {
		return;
		if (scrollState.isScrollLocked === lock) return;
		$(document).trigger('scroll_lock_change', [lock]);
		const $messagesContainer = $('#chat-messages');
		if ($messagesContainer.length === 0) {
			return;
		}
		if (lock) {
			if (scrollState.scrollLockTimeout) {
				clearTimeout(scrollState.scrollLockTimeout);
			}
			scrollState.scrollLockTimeout = setTimeout(() => {
				lockScroll(false);
			}, timeout);
			scrollState.scrollPosition = $messagesContainer.scrollTop();
			$messagesContainer
				.attr('data-scroll-locked', 'true')
				.css({
					overflow: 'hidden',
					'overflow-y': 'hidden',
					'pointer-events': 'none',
					opacity: '0.9',
					position: 'relative',
				})
				.addClass('scroll-locked');
			$messagesContainer[0].style.setProperty('overflow', 'hidden', 'important');
			$messagesContainer[0].style.setProperty('overflow-y', 'hidden', 'important');
			$messagesContainer[0].style.setProperty('pointer-events', 'none', 'important');
			scrollState.isScrollLocked = true;
			if (!$('#scroll-lock-indicator').length) {
				const $indicator = $('<div id="scroll-lock-indicator">メッセージ読み込み中</div>').css({
					position: 'fixed',
					bottom: '50px',
					left: '50%',
					transform: 'translateX(-50%)',
					background: 'rgba(0,0,0,0.8)',
					color: 'white',
					padding: '8px 15px',
					borderRadius: '20px',
					zIndex: '10000',
					display: 'none',
					boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
				});
				$('body').append($indicator);
				$indicator.fadeIn(200);
			}
			const preventScroll = function (e) {
				if (scrollState.isScrollLocked && scrollState.scrollPosition !== null) {
					$messagesContainer.scrollTop(scrollState.scrollPosition);
				}
			};
			$messagesContainer.off('scroll.lockScroll').on('scroll.lockScroll', preventScroll);
			$(document).trigger('scroll_locked');
		} else {
			if (scrollState.scrollLockTimeout) {
				clearTimeout(scrollState.scrollLockTimeout);
				scrollState.scrollLockTimeout = null;
			}
			$messagesContainer.off('scroll.lockScroll');
			$messagesContainer
				.removeAttr('data-scroll-locked')
				.css({
					overflow: 'auto',
					'overflow-y': 'auto',
					'pointer-events': 'auto',
					opacity: '1',
					position: 'relative',
				})
				.removeClass('scroll-locked');
			if (scrollState.scrollPosition !== null) {
				$messagesContainer.scrollTop(scrollState.scrollPosition);
			}
			scrollState.isScrollLocked = false;
			$('#scroll-lock-indicator').fadeOut(200, function () {
				$(this).remove();
			});
			$(document).trigger('scroll_unlocked');
		}
	};
	const detectScrollDirection = (currentScrollTop) => {
		let direction = 'none';
		if (currentScrollTop > scrollState.lastScrollTop) {
			direction = 'down';
		} else if (currentScrollTop < scrollState.lastScrollTop) {
			direction = 'up';
		}
		scrollState.lastScrollTop = currentScrollTop;
		scrollState.scrollingDirection = direction;
		return direction;
	};
	const setLoadingState = (isLoading) => {
		scrollState.isLoading = isLoading;
		$(document).trigger('loading_state_change', [isLoading]);
	};
	const isLoading = () => {
		return scrollState.isLoading;
	};
	const isScrollLocked = () => {
		return scrollState.isScrollLocked;
	};
	const getScrollDirection = () => {
		return scrollState.scrollingDirection;
	};
	const resetScrollState = () => {
		hideLoader();
		if (scrollState.isScrollLocked) {
			lockScroll(false);
		}
		scrollState.isLoading = false;
		scrollState.loaderCreationAttempts = 0;
		$(document).trigger('scroll_state_reset');
	};
	window.LMSChat.scrollUtils = {
		showLoader,
		hideLoader,
		hideAllLoaders,
		lockScroll,
		detectScrollDirection,
		setLoadingState,
		isLoading,
		isScrollLocked,
		getScrollDirection,
		resetScrollState,
	};
	$(document).ready(() => {
		const setupMutationObserver = () => {
			const observer = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
						if (scrollState.isScrollLocked && $('#scroll-lock-indicator').length === 0) {
							lockScroll(true);
						}
					}
				});
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});
		};
		if (typeof MutationObserver !== 'undefined') {
			setupMutationObserver();
		}
		$(document).trigger('scroll_utils_loaded');
	});
})(jQuery);
