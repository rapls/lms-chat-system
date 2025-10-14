/**
 * LMS チャットローダー
 * チャット関連スクリプトを正しい順序で読み込み
 */
(function() {
    'use strict';

    // 既に読み込み済みの場合はスキップ
    if (window.LMSChatLoader && window.LMSChatLoader.loaded) {
        return;
    }

    const THEME_URL = '/wp-content/themes/lms';
    const JS_PATH = THEME_URL + '/js/';

    // 読み込むスクリプトの定義（順序が重要）
    const scripts = [
        // コアシステム
        { src: JS_PATH + 'chat-core.js', id: 'lms-chat-core' },
        { src: JS_PATH + 'chat-messages.js', id: 'lms-chat-messages' },
        { src: JS_PATH + 'chat-ui.js', id: 'lms-chat-ui' },

        // リアクションシステム
        { src: JS_PATH + 'chat-reactions-core.js', id: 'lms-chat-reactions-core' },
        { src: JS_PATH + 'chat-reactions-cache.js', id: 'lms-chat-reactions-cache' },
        { src: JS_PATH + 'chat-reactions-ui.js', id: 'lms-chat-reactions-ui' },
        { src: JS_PATH + 'chat-reactions-actions.js', id: 'lms-chat-reactions-actions' },
        { src: JS_PATH + 'chat-reactions-sync.js', id: 'lms-chat-reactions-sync' },
        { src: JS_PATH + 'emergency-reaction-sync.js', id: 'lms-emergency-reaction-sync' },
        { src: JS_PATH + 'direct-reaction-sync.js', id: 'lms-direct-reaction-sync' },
        { src: JS_PATH + 'chat-reactions.js', id: 'lms-chat-reactions' },
        { src: JS_PATH + 'thread-reactions.js', id: 'lms-thread-reactions' },

        // Long Polling
        { src: JS_PATH + 'chat-longpoll.js', id: 'lms-chat-longpoll' },

        // その他の機能
        { src: JS_PATH + 'chat-threads.js', id: 'lms-chat-threads' },
        { src: JS_PATH + 'chat-search.js', id: 'lms-chat-search' },
        { src: JS_PATH + 'chat-scroll-utility.js', id: 'lms-chat-scroll' },

        // パフォーマンス最適化
        { src: JS_PATH + 'lms-chat-performance-optimizer.js', id: 'lms-chat-performance' },

        // メインチャットファイル
        { src: JS_PATH + 'chat.js', id: 'lms-chat-main' }
    ];

    // バージョン管理（キャッシュバスティング用）
    const version = Date.now();

    /**
     * スクリプトを順番に読み込む
     */
    function loadScriptsInOrder(scriptList, index = 0) {
        if (index >= scriptList.length) {
            // 読み込み完了フラグを設定
            window.LMSChatLoader.loaded = true;
            // 初期化完了イベント発火
            if (typeof jQuery !== 'undefined') {
                jQuery(document).trigger('lms_chat_scripts_loaded');
            }
            return;
        }

        const script = scriptList[index];

        // IDまたはSRCで既存スクリプトをチェック
        const existingScript = document.getElementById(script.id) ||
            document.querySelector(`script[src*="${script.src.split('?')[0]}"]`);

        // 既に読み込まれているかチェック
        if (existingScript) {
            loadScriptsInOrder(scriptList, index + 1);
            return;
        }

        const scriptElement = document.createElement('script');
        scriptElement.id = script.id;
        scriptElement.src = script.src + '?ver=' + version;
        scriptElement.defer = true;

        scriptElement.onload = function() {
            loadScriptsInOrder(scriptList, index + 1);
        };

        scriptElement.onerror = function() {
            // エラーが発生しても次のスクリプトを読み込む
            loadScriptsInOrder(scriptList, index + 1);
        };

        document.body.appendChild(scriptElement);
    }

    /**
     * DOMContentLoaded時に実行
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            loadScriptsInOrder(scripts);
        });
    } else {
        // 既にDOMが読み込まれている場合
        loadScriptsInOrder(scripts);
    }

    // グローバルに公開（デバッグ用）
    window.LMSChatLoader = {
        loaded: false,  // 読み込み状態フラグ
        scripts: scripts,
        reload: function() {
            loadScriptsInOrder(scripts);
        }
    };

})();
