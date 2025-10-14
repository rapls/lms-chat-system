<?php
/**
 * ロングポーリング移行管理 - 管理画面
 *
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

try {
    $migration_controller = LMS_Migration_Controller::get_instance();
    $config = $migration_controller->get_config();
    $health_metrics = $migration_controller->get_health_metrics();
} catch (Exception $e) {
    echo '<div class="wrap">';
    echo '<h1>ロングポーリング移行管理</h1>';
    echo '<div class="error"><p>初期化エラー: ' . esc_html($e->getMessage()) . '</p></div>';
    echo '</div>';
    return;
}

// ステージ名の定義
$stage_names = [
    0 => '無効',
    1 => 'ベータテスト',
    2 => 'カナリアリリース (5%)',
    3 => '段階的展開',
    4 => '完全移行'
];

$stage_colors = [
    0 => '#dc3232',
    1 => '#ffb900',
    2 => '#00a0d2',
    3 => '#7ad03a',
    4 => '#00a32a'
];

?>

<div class="wrap">
    <h1>🚀 ロングポーリング移行管理</h1>
    
    <div id="longpoll-admin-content">
        
        <!-- システム状態 -->
        <div class="card" style="margin-bottom: 20px;">
            <h2>📊 システム状態</h2>
            <table class="widefat fixed striped">
                <tbody>
                    <tr>
                        <td><strong>現在のステージ</strong></td>
                        <td>
                            <span style="
                                background: <?php echo $stage_colors[$config['stage']]; ?>;
                                color: white;
                                padding: 4px 12px;
                                border-radius: 12px;
                                font-weight: bold;
                            ">
                                <?php echo $stage_names[$config['stage']]; ?>
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td><strong>ロールアウト率</strong></td>
                        <td>
                            <div style="display: flex; align-items: center;">
                                <div style="
                                    width: 200px;
                                    height: 20px;
                                    background: #f0f0f0;
                                    border-radius: 10px;
                                    overflow: hidden;
                                    margin-right: 10px;
                                ">
                                    <div style="
                                        width: <?php echo $config['rollout_percentage']; ?>%;
                                        height: 100%;
                                        background: <?php echo $config['rollout_percentage'] > 50 ? '#00a32a' : '#7ad03a'; ?>;
                                        transition: width 0.3s ease;
                                    "></div>
                                </div>
                                <strong><?php echo $config['rollout_percentage']; ?>%</strong>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td><strong>ベータユーザー数</strong></td>
                        <td><?php echo count($config['beta_users']); ?>人</td>
                    </tr>
                    <tr>
                        <td><strong>システム健全性</strong></td>
                        <td>
                            <?php if ($migration_controller->get_health_metrics()['error_rate'] <= 0.05): ?>
                                <span style="color: #00a32a; font-weight: bold;">✅ 健全</span>
                            <?php else: ?>
                                <span style="color: #dc3232; font-weight: bold;">❌ 問題あり</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- ヘルスメトリクス -->
        <div class="card" style="margin-bottom: 20px;">
            <h2>📈 ヘルスメトリクス</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                <div style="text-align: center;">
                    <h3 style="margin: 0; color: #666;">エラー率</h3>
                    <div style="font-size: 24px; font-weight: bold; color: <?php echo $health_metrics['error_rate'] <= 0.05 ? '#00a32a' : '#dc3232'; ?>;">
                        <?php echo round($health_metrics['error_rate'] * 100, 2); ?>%
                    </div>
                </div>
                <div style="text-align: center;">
                    <h3 style="margin: 0; color: #666;">平均レスポンス時間</h3>
                    <div style="font-size: 24px; font-weight: bold; color: <?php echo $health_metrics['avg_response_time'] <= 2000 ? '#00a32a' : '#dc3232'; ?>;">
                        <?php echo round($health_metrics['avg_response_time']); ?>ms
                    </div>
                </div>
                <div style="text-align: center;">
                    <h3 style="margin: 0; color: #666;">成功率</h3>
                    <div style="font-size: 24px; font-weight: bold; color: <?php echo $health_metrics['success_rate'] >= 0.95 ? '#00a32a' : '#dc3232'; ?>;">
                        <?php echo round($health_metrics['success_rate'] * 100, 1); ?>%
                    </div>
                </div>
                <div style="text-align: center;">
                    <h3 style="margin: 0; color: #666;">アクティブ接続</h3>
                    <div style="font-size: 24px; font-weight: bold; color: #0073aa;">
                        <?php echo $health_metrics['active_connections']; ?>
                    </div>
                </div>
            </div>
        </div>

        <!-- ステージ制御 -->
        <div class="card" style="margin-bottom: 20px;">
            <h2>🎛️ ステージ制御</h2>
            <div style="margin-bottom: 20px;">
                <label for="migration-stage"><strong>移行ステージ:</strong></label>
                <select id="migration-stage" style="margin-left: 10px;">
                    <?php foreach ($stage_names as $stage_id => $stage_name): ?>
                        <option value="<?php echo $stage_id; ?>" <?php selected($config['stage'], $stage_id); ?>>
                            <?php echo $stage_name; ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <button id="update-stage" class="button button-primary" style="margin-left: 10px;">
                    ステージ更新
                </button>
            </div>

            <?php if ($config['stage'] >= 3): ?>
            <div style="margin-bottom: 20px;">
                <label for="rollout-percentage"><strong>ロールアウト率:</strong></label>
                <input type="range" id="rollout-percentage" min="0" max="100" value="<?php echo $config['rollout_percentage']; ?>" style="width: 200px; margin: 0 10px;">
                <span id="rollout-value"><?php echo $config['rollout_percentage']; ?>%</span>
                <button id="update-rollout" class="button button-primary" style="margin-left: 10px;">
                    ロールアウト率更新
                </button>
            </div>
            <?php endif; ?>
        </div>

        <!-- ベータユーザー管理 -->
        <div class="card" style="margin-bottom: 20px;">
            <h2>👥 ベータユーザー管理</h2>
            
            <div style="margin-bottom: 20px;">
                <label for="beta-user-id"><strong>ユーザーID:</strong></label>
                <input type="number" id="beta-user-id" min="1" placeholder="ユーザーIDを入力" style="margin-left: 10px;">
                <button id="add-beta-user" class="button button-secondary" style="margin-left: 10px;">
                    ベータユーザーに追加
                </button>
            </div>

            <?php if (!empty($config['beta_users'])): ?>
            <div>
                <h4>現在のベータユーザー:</h4>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <?php foreach ($config['beta_users'] as $user_id): ?>
                        <li style="margin: 5px 0;">
                            ユーザーID: <?php echo $user_id; ?>
                            <?php 
                            $user = get_user_by('id', $user_id);
                            if ($user) {
                                echo ' (' . esc_html($user->display_name) . ')';
                            }
                            ?>
                            <button class="button button-small remove-beta-user" data-user-id="<?php echo $user_id; ?>" style="margin-left: 10px;">
                                削除
                            </button>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <?php endif; ?>
        </div>

        <!-- フィーチャーフラグ -->
        <div class="card" style="margin-bottom: 20px;">
            <h2>🏁 フィーチャーフラグ</h2>
            <table class="widefat fixed striped">
                <thead>
                    <tr>
                        <th>フィーチャー</th>
                        <th>状態</th>
                        <th>アクション</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($config['feature_flags'] as $feature => $enabled): ?>
                    <tr>
                        <td><?php echo esc_html($feature); ?></td>
                        <td>
                            <span style="color: <?php echo $enabled ? '#00a32a' : '#dc3232'; ?>; font-weight: bold;">
                                <?php echo $enabled ? '✅ 有効' : '❌ 無効'; ?>
                            </span>
                        </td>
                        <td>
                            <button class="button toggle-feature" 
                                    data-feature="<?php echo esc_attr($feature); ?>" 
                                    data-enabled="<?php echo $enabled ? '1' : '0'; ?>">
                                <?php echo $enabled ? '無効にする' : '有効にする'; ?>
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- 緊急制御 -->
        <div class="card" style="border-left: 4px solid #dc3232;">
            <h2 style="color: #dc3232;">🚨 緊急制御</h2>
            <p>問題が発生した場合は、即座にロールバックできます。</p>
            
            <div style="margin-top: 20px;">
                <label for="rollback-reason"><strong>ロールバック理由:</strong></label><br>
                <textarea id="rollback-reason" rows="3" cols="50" placeholder="ロールバックの理由を入力してください" style="margin-top: 5px;"></textarea>
            </div>
            
            <button id="emergency-rollback" class="button" style="
                background: #dc3232;
                color: white;
                border-color: #dc3232;
                margin-top: 10px;
            ">
                🚨 緊急ロールバック実行
            </button>
        </div>

    </div>

    <!-- メッセージ表示エリア -->
    <div id="admin-messages" style="margin-top: 20px;"></div>
</div>

<style>
.card {
    background: #fff;
    border: 1px solid #ccd0d4;
    border-radius: 4px;
    padding: 20px;
    box-shadow: 0 1px 1px rgba(0,0,0,.04);
}

.card h2 {
    margin-top: 0;
    border-bottom: 1px solid #e1e1e1;
    padding-bottom: 10px;
}

#admin-messages .notice {
    margin: 5px 0;
    padding: 10px;
    border-left: 4px solid;
    background: #fff;
}

#admin-messages .notice-success {
    border-left-color: #00a32a;
    background: #f0fff4;
}

#admin-messages .notice-error {
    border-left-color: #dc3232;
    background: #fff5f5;
}

#admin-messages .notice-warning {
    border-left-color: #ffb900;
    background: #fffbf0;
}
</style>

<script>
jQuery(document).ready(function($) {
    
    // メッセージ表示用のヘルパー関数
    function showMessage(message, type = 'success') {
        const messageClass = 'notice-' + type;
        const messageHtml = `<div class="notice ${messageClass}"><p>${message}</p></div>`;
        $('#admin-messages').html(messageHtml);
        
        // 5秒後にメッセージを消去
        setTimeout(() => {
            $('#admin-messages').empty();
        }, 5000);
    }
    
    // ロールアウト率のスライダー更新
    $('#rollout-percentage').on('input', function() {
        $('#rollout-value').text($(this).val() + '%');
    });
    
    // ステージ更新
    $('#update-stage').click(function() {
        const stage = $('#migration-stage').val();
        
        $.post(ajaxurl, {
            action: 'lms_migration_control',
            migration_action: 'set_stage',
            stage: stage,
            _wpnonce: '<?php echo wp_create_nonce('lms_migration_control'); ?>'
        })
        .done(function(response) {
            if (response.success) {
                showMessage(response.data.message, 'success');
                location.reload(); // ページリロードで状態を更新
            } else {
                showMessage(response.data, 'error');
            }
        })
        .fail(function() {
            showMessage('ステージ更新でエラーが発生しました', 'error');
        });
    });
    
    // ロールアウト率更新
    $('#update-rollout').click(function() {
        const percentage = $('#rollout-percentage').val();
        
        $.post(ajaxurl, {
            action: 'lms_migration_control',
            migration_action: 'set_rollout',
            percentage: percentage,
            _wpnonce: '<?php echo wp_create_nonce('lms_migration_control'); ?>'
        })
        .done(function(response) {
            if (response.success) {
                showMessage(response.data.message, 'success');
            } else {
                showMessage(response.data, 'error');
            }
        })
        .fail(function() {
            showMessage('ロールアウト率更新でエラーが発生しました', 'error');
        });
    });
    
    // ベータユーザー追加
    $('#add-beta-user').click(function() {
        const userId = $('#beta-user-id').val();
        
        if (!userId) {
            showMessage('ユーザーIDを入力してください', 'warning');
            return;
        }
        
        $.post(ajaxurl, {
            action: 'lms_migration_control',
            migration_action: 'add_beta_user',
            user_id: userId,
            _wpnonce: '<?php echo wp_create_nonce('lms_migration_control'); ?>'
        })
        .done(function(response) {
            if (response.success) {
                showMessage(response.data.message, 'success');
                location.reload(); // ページリロードでリスト更新
            } else {
                showMessage(response.data, 'error');
            }
        })
        .fail(function() {
            showMessage('ベータユーザー追加でエラーが発生しました', 'error');
        });
    });
    
    // ベータユーザー削除
    $('.remove-beta-user').click(function() {
        const userId = $(this).data('user-id');
        
        $.post(ajaxurl, {
            action: 'lms_migration_control',
            migration_action: 'remove_beta_user',
            user_id: userId,
            _wpnonce: '<?php echo wp_create_nonce('lms_migration_control'); ?>'
        })
        .done(function(response) {
            if (response.success) {
                showMessage(response.data.message, 'success');
                location.reload(); // ページリロードでリスト更新
            } else {
                showMessage(response.data, 'error');
            }
        })
        .fail(function() {
            showMessage('ベータユーザー削除でエラーが発生しました', 'error');
        });
    });
    
    // フィーチャーフラグ切り替え
    $('.toggle-feature').click(function() {
        const feature = $(this).data('feature');
        const currentEnabled = $(this).data('enabled') === '1';
        const newEnabled = !currentEnabled;
        
        $.post(ajaxurl, {
            action: 'lms_migration_control',
            migration_action: 'toggle_feature',
            feature: feature,
            enabled: newEnabled,
            _wpnonce: '<?php echo wp_create_nonce('lms_migration_control'); ?>'
        })
        .done(function(response) {
            if (response.success) {
                showMessage(response.data.message, 'success');
                location.reload(); // ページリロードで状態更新
            } else {
                showMessage(response.data, 'error');
            }
        })
        .fail(function() {
            showMessage('フィーチャーフラグ更新でエラーが発生しました', 'error');
        });
    });
    
    // 緊急ロールバック
    $('#emergency-rollback').click(function() {
        const reason = $('#rollback-reason').val();
        
        if (!reason.trim()) {
            showMessage('ロールバック理由を入力してください', 'warning');
            return;
        }
        
        if (!confirm('本当に緊急ロールバックを実行しますか？この操作により、統合ロングポーリングシステムが無効になります。')) {
            return;
        }
        
        $.post(ajaxurl, {
            action: 'lms_migration_control',
            migration_action: 'emergency_rollback',
            reason: reason,
            _wpnonce: '<?php echo wp_create_nonce('lms_migration_control'); ?>'
        })
        .done(function(response) {
            if (response.success) {
                showMessage(response.data.message + ' ページをリロードしています...', 'success');
                setTimeout(() => {
                    location.reload();
                }, 2000);
            } else {
                showMessage(response.data, 'error');
            }
        })
        .fail(function() {
            showMessage('緊急ロールバックでエラーが発生しました', 'error');
        });
    });
    
    // 定期的なヘルスメトリクス更新（30秒ごと）
    setInterval(function() {
        $.post(ajaxurl, {
            action: 'lms_migration_health'
        })
        .done(function(response) {
            if (response.success) {
                // ヘルスメトリクスの部分的更新（必要に応じて）
            }
        });
    }, 30000);
});
</script>