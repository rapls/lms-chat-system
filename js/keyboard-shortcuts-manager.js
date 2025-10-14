/**
 * 統合キーボードショートカット管理システム
 * 
 * ※注意: このシステムは一時的に無効化されています
 * 個別システムでの直接実装に移行しました
 * 
 * @version 1.0.0 (DISABLED)
 */

/* 一時的に無効化 - 個別システムでの直接実装を採用
(function($) {
    'use strict';

    /**
     * キーボードショートカット管理クラス
     */
    class KeyboardShortcutsManager {
        constructor() {
            this.shortcuts = new Map();
            this.isInitialized = false;
            this.init();
        }

        init() {
            $(document).ready(() => {
                this.registerShortcuts();
                this.setupEventHandlers();
                this.createHelpDialog();
                this.isInitialized = true;
            });
        }

        /**
         * ショートカット登録
         */
        registerShortcuts() {
            // Shift + Ctrl + L: デバッグモニター
            this.addShortcut('shift+ctrl+l', {
                keys: [16, 17, 76], // Shift + Ctrl + L
                description: 'デバッグモニター表示',
                action: () => {
                    if (window.unifiedLongPoll && window.unifiedLongPoll.showDebugModal) {
                        window.unifiedLongPoll.showDebugModal();
                    }
                }
            });

            // Ctrl + Shift + T: 統合テストパネル
            this.addShortcut('ctrl+shift+t', {
                keys: [17, 16, 84], // Ctrl + Shift + T
                description: '統合テストパネル表示',
                action: () => {
                    // Debug output removed
                    
                    // 複数のフォールバック方法を試行
                    if (window.unifiedLongPoll && window.unifiedLongPoll.showIntegrationTestPanel) {
                        // Debug output removed
                        window.unifiedLongPoll.showIntegrationTestPanel();
                        return;
                    }
                    
                    if (window.showIntegrationTestPanel) {
                        // Debug output removed
                        window.showIntegrationTestPanel();
                        return;
                    }
                    
                    if (window.LMSDebugCommands && window.LMSDebugCommands.showIntegrationTestPanel) {
                        // Debug output removed
                        window.LMSDebugCommands.showIntegrationTestPanel();
                        return;
                    }
                    
                    // 緊急フォールバック: 直接要素を探して表示
                    const testPanel = document.getElementById('lms-integration-test-panel');
                    if (testPanel) {
                        // Debug output removed
                        testPanel.style.display = 'block';
                        return;
                    }
                    
                    // Debug output removed
                }
            });

            // Ctrl + Shift + M: 移行テスト画面
            this.addShortcut('ctrl+shift+m', {
                keys: [17, 16, 77], // Ctrl + Shift + M
                description: '移行テスト画面表示',
                action: () => {
                    // Debug output removed
                    
                    // 複数のフォールバック方法を試行
                    if (window.migrationTest && window.migrationTest.showTestInterface) {
                        // Debug output removed
                        window.migrationTest.showTestInterface();
                        return;
                    }
                    
                    if (window.showMigrationTest) {
                        // Debug output removed
                        window.showMigrationTest();
                        return;
                    }
                    
                    if (window.LMSDebugCommands && window.LMSDebugCommands.showMigrationTest) {
                        // Debug output removed
                        window.LMSDebugCommands.showMigrationTest();
                        return;
                    }
                    
                    // 緊急フォールバック: 直接要素を探して表示
                    const testInterface = document.getElementById('longpoll-migration-test');
                    if (testInterface) {
                        // Debug output removed
                        testInterface.style.display = 'block';
                        return;
                    }
                    
                    // Debug output removed
                }
            });

            // Ctrl + Shift + P: パフォーマンス監視
            this.addShortcut('ctrl+shift+p', {
                keys: [17, 16, 80], // Ctrl + Shift + P
                description: 'パフォーマンス監視ダッシュボード切替',
                action: () => {
                    // Debug output removed
                    
                    // 複数のフォールバック方法を試行
                    if (window.performanceMonitor && window.performanceMonitor.toggleDashboard) {
                        // Debug output removed
                        window.performanceMonitor.toggleDashboard();
                        return;
                    }
                    
                    if (window.togglePerformanceDashboard) {
                        // Debug output removed
                        window.togglePerformanceDashboard();
                        return;
                    }
                    
                    if (window.LMSDebugCommands && window.LMSDebugCommands.showPerformanceDashboard) {
                        // Debug output removed
                        window.LMSDebugCommands.showPerformanceDashboard();
                        return;
                    }
                    
                    // 緊急フォールバック: 直接要素を探して表示
                    const dashboard = document.getElementById('performance-dashboard');
                    if (dashboard) {
                        // Debug output removed
                        dashboard.style.display = dashboard.style.display === 'none' ? 'block' : 'none';
                        return;
                    }
                    
                    // Debug output removed
                }
            });

            // Ctrl + Shift + H: ヘルプ表示
            this.addShortcut('ctrl+shift+h', {
                keys: [17, 16, 72], // Ctrl + Shift + H
                description: 'キーボードショートカットヘルプ表示',
                action: () => this.showHelpDialog()
            });
        }

        /**
         * ショートカット追加
         */
        addShortcut(name, config) {
            this.shortcuts.set(name, config);
        }

        /**
         * イベントハンドラー設定
         */
        setupEventHandlers() {
            // より確実なキー検出方法に変更
            const handleKeyDown = (e) => {
                const keyCode = e.which || e.keyCode;
                
                // 各ショートカットを個別にチェック
                // Shift + Ctrl + L (デバッグモニター)
                if (e.shiftKey && e.ctrlKey && keyCode === 76) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.executeShortcut('shift+ctrl+l');
                    return false;
                }
                
                // Ctrl + Shift + T (統合テストパネル)
                if (e.ctrlKey && e.shiftKey && keyCode === 84) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.executeShortcut('ctrl+shift+t');
                    return false;
                }
                
                // Ctrl + Shift + M (移行テスト)
                if (e.ctrlKey && e.shiftKey && keyCode === 77) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.executeShortcut('ctrl+shift+m');
                    return false;
                }
                
                // Ctrl + Shift + P (パフォーマンス監視)
                if (e.ctrlKey && e.shiftKey && keyCode === 80) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.executeShortcut('ctrl+shift+p');
                    return false;
                }
                
                // Ctrl + Shift + H (ヘルプ)
                if (e.ctrlKey && e.shiftKey && keyCode === 72) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.executeShortcut('ctrl+shift+h');
                    return false;
                }
            };

            // 複数の方法でイベント登録（確実性を高める）
            $(document).off('keydown.shortcutManager').on('keydown.shortcutManager', handleKeyDown);
            
            // 既存のイベントより優先させるため、キャプチャフェーズで登録
            document.addEventListener('keydown', handleKeyDown, true);
            
            // ログ出力で動作確認
            setTimeout(() => {
                // Debug output removed
                // Debug output removed));
            }, 1000);
        }

        /**
         * ショートカット押下判定
         */
        isShortcutPressed(targetKeys, pressedKeys) {
            if (targetKeys.length !== pressedKeys.size) {
                return false;
            }
            
            return targetKeys.every(key => pressedKeys.has(key));
        }

        /**
         * ヘルプダイアログ作成
         */
        createHelpDialog() {
            const helpHTML = `
                <div id="keyboard-shortcuts-help" style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 500px;
                    max-width: 90vw;
                    background: white;
                    border: 3px solid #0073aa;
                    border-radius: 12px;
                    padding: 25px;
                    z-index: 25000;
                    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: none;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #0073aa;">⌨️ キーボードショートカット</h2>
                        <button onclick="document.getElementById('keyboard-shortcuts-help').style.display='none'" style="
                            background: #dc3545;
                            color: white;
                            border: none;
                            padding: 8px 12px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: bold;
                        ">✕</button>
                    </div>
                    
                    <div id="shortcuts-list" style="
                        display: grid;
                        gap: 12px;
                        font-size: 14px;
                    ">
                        <!-- ショートカット一覧がここに表示されます -->
                    </div>
                    
                    <div style="
                        margin-top: 20px;
                        padding-top: 15px;
                        border-top: 2px solid #e9ecef;
                        text-align: center;
                        color: #666;
                        font-size: 12px;
                    ">
                        💡 このヘルプは <strong>Ctrl+Shift+H</strong> でいつでも表示できます
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', helpHTML);
            this.updateHelpContent();
        }

        /**
         * ヘルプ内容更新
         */
        updateHelpContent() {
            const shortcutsList = document.getElementById('shortcuts-list');
            if (!shortcutsList) return;

            let html = '';
            for (const [name, config] of this.shortcuts) {
                const keyCombo = this.formatKeyCombo(config.keys);
                const status = this.checkShortcutAvailable(name) ? '✅' : '❌';
                
                html += `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px;
                        background: #f8f9fa;
                        border-radius: 6px;
                        border-left: 4px solid #0073aa;
                    ">
                        <div>
                            <strong style="color: #0073aa;">${keyCombo}</strong>
                            <div style="color: #666; font-size: 12px; margin-top: 2px;">
                                ${config.description}
                            </div>
                        </div>
                        <div style="font-size: 18px;">${status}</div>
                    </div>
                `;
            }

            shortcutsList.innerHTML = html;
        }

        /**
         * キーコンビネーション表示用フォーマット
         */
        formatKeyCombo(keys) {
            const keyNames = {
                16: 'Shift',
                17: 'Ctrl',
                18: 'Alt',
                76: 'L',
                72: 'H',
                77: 'M',
                80: 'P',
                84: 'T'
            };

            return keys.map(key => keyNames[key] || `Key${key}`).join(' + ');
        }

        /**
         * ショートカット利用可能性チェック
         */
        checkShortcutAvailable(name) {
            const config = this.shortcuts.get(name);
            if (!config) return false;

            try {
                // 実際に関数が存在するかチェック
                if (name === 'shift+ctrl+l') {
                    return !!(window.unifiedLongPoll && window.unifiedLongPoll.showDebugModal);
                }
                if (name === 'ctrl+shift+t') {
                    return !!(window.unifiedLongPoll && window.unifiedLongPoll.showIntegrationTestPanel);
                }
                if (name === 'ctrl+shift+m') {
                    return !!(window.migrationTest || window.showMigrationTest);
                }
                if (name === 'ctrl+shift+p') {
                    return !!(window.performanceMonitor || window.togglePerformanceDashboard);
                }
                return true;
            } catch (error) {
                return false;
            }
        }

        /**
         * ヘルプダイアログ表示
         */
        showHelpDialog() {
            this.updateHelpContent(); // 最新状態に更新
            const helpDialog = document.getElementById('keyboard-shortcuts-help');
            if (helpDialog) {
                helpDialog.style.display = 'block';
            }
        }

        /**
         * 手動でショートカットを実行
         */
        executeShortcut(name) {
            // Debug output removed
            
            const config = this.shortcuts.get(name);
            if (config && config.action) {
                try {
                    config.action();
                    // Debug output removed
                    return true;
                } catch (error) {
                    // Debug output removed
                    return false;
                }
            }
            
            // Debug output removed
            return false;
        }

        /**
         * 利用可能なショートカット一覧取得
         */
        getAvailableShortcuts() {
            const available = [];
            for (const [name, config] of this.shortcuts) {
                if (this.checkShortcutAvailable(name)) {
                    available.push({
                        name,
                        keys: this.formatKeyCombo(config.keys),
                        description: config.description
                    });
                }
            }
            return available;
        }
    }

    /**
     * システム初期化
     */
    $(document).ready(function() {
        // 重複防止
        if (window.keyboardShortcuts) {
            // Debug output removed
            return;
        }

        // Debug output removed

        // キーボードショートカット管理システム起動
        const keyboardManager = new KeyboardShortcutsManager();
        
        // グローバル参照設定
        window.keyboardShortcuts = keyboardManager;
        
        // 便利な関数もグローバルに
        window.showKeyboardHelp = () => keyboardManager.showHelpDialog();
        
        // デバッグ用の個別実行関数
        window.testShortcuts = {
            testMigration: () => keyboardManager.executeShortcut('ctrl+shift+m'),
            testPerformance: () => keyboardManager.executeShortcut('ctrl+shift+p'),
            testDebug: () => keyboardManager.executeShortcut('shift+ctrl+l'),
            testIntegration: () => keyboardManager.executeShortcut('ctrl+shift+t'),
            testHelp: () => keyboardManager.executeShortcut('ctrl+shift+h'),
            testAll: () => {
                // Debug output removed
                // Debug output removed);
                setTimeout(() => // Debug output removed), 1000);
                setTimeout(() => // Debug output removed), 2000);
                setTimeout(() => // Debug output removed), 3000);
                setTimeout(() => // Debug output removed), 4000);
            }
        };
        
        // より確実な初期化のため段階的に実行
        setTimeout(() => {
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed で全ショートカットをテストできます');
        }, 1000);

        // さらに遅延して確実性を高める
        setTimeout(() => {
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed
            // Debug output removed
        }, 3000);
    });

})(jQuery);
*/