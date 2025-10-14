/**
 * LMS Chat Admin JavaScript
 * WordPress管理画面でのチャット管理機能用スクリプト
 */

jQuery(document).ready(function($) {
    
    var detectedIssues = [];
    $('#run-health-check').on('click', function() {
        var $button = $(this);
        var $progress = $('#health-check-progress');
        var $results = $('#health-check-results');
        
        $button.prop('disabled', true);
        $progress.show();
        $results.hide().empty();
        detectedIssues = [];
        
        $.ajax({
            url: lms_chat_admin.ajax_url,
            type: 'POST',
            data: {
                action: 'lms_chat_health_check',
                nonce: lms_chat_admin.nonce
            },
            success: function(response) {
                $progress.hide();
                $button.prop('disabled', false);
                if (response.success) {
                    displayHealthCheckResults(response);
                } else {
                    $results.html('<div class="notice notice-error"><p>チェック中にエラーが発生しました。</p></div>').show();
                }
            },
            error: function(xhr, status, error) {
                $progress.hide();
                $button.prop('disabled', false);
                $results.html('<div class="notice notice-error"><p>通信エラーが発生しました: ' + error + '</p></div>').show();
            }
        });
    });
    
    /**
     * 健全性チェック結果の表示
     */
    function displayHealthCheckResults(response) {
        var $results = $('#health-check-results');
        
        detectedIssues = [];
        
        var html = '<h3>チェック結果</h3>';
        
        html += '<div class="stats-box">';
        html += '<h4>データベース統計</h4>';
        html += '<ul class="stats-list">';
        html += '<li><strong>総メッセージ数:</strong> ' + response.stats.total_messages + '</li>';
        html += '<li><strong>総スレッド数:</strong> ' + response.stats.total_threads + '</li>';
        html += '<li><strong>総チャンネル数:</strong> ' + response.stats.total_channels + '</li>';
        html += '<li><strong>総メンバー数:</strong> ' + response.stats.total_members + '</li>';
        html += '</ul>';
        html += '</div>';
        
        if (response.issue_count === 0) {
            html += '<div class="notice notice-success">';
            html += '<p><span class="dashicons dashicons-yes-alt"></span> データベースは健全です。問題は検出されませんでした。</p>';
            html += '</div>';
            $results.html(html).show();
            return;
        }
        
        html += '<div class="notice notice-warning">';
        html += '<p><strong>' + response.issue_count + ' 種類の問題が検出されました。</strong></p>';
        html += '</div>';
        
        $.each(response.issues, function(key, issue) {
            var iconClass = issue.type === 'error' ? 'dashicons-warning' : (issue.type === 'warning' ? 'dashicons-info' : 'dashicons-info-outline');
            var noticeClass = issue.type === 'error' ? 'notice-error' : (issue.type === 'warning' ? 'notice-warning' : 'notice-info');
            
            html += '<div class="issue-item notice ' + noticeClass + '">';
            html += '<h4><span class="dashicons ' + iconClass + '"></span> ' + issue.title + '</h4>';
            html += '<p>' + issue.description + '</p>';
            if (issue.fix_available === true && issue.fix_action) {
                html += '<p class="individual-fix-btn-container">';
                html += '<button type="button" class="button individual-fix-btn" data-action="' + issue.fix_action + '" data-title="' + issue.title + '">';
                html += '<span class="dashicons dashicons-admin-tools"></span> この問題を修復';
                html += '</button>';
                html += '</p>';
            }
            
            if (issue.count) {
                html += '<p><strong>影響を受けるレコード数:</strong> ' + issue.count + '</p>';
            }
            
            if (issue.details && issue.details.length > 0) {
                html += '<details class="issue-details">';
                html += '<summary>詳細を表示</summary>';
                html += '<div class="details-content">';
                
                if (key === 'orphaned_threads') {
                    html += '<table class="details-table">';
                    html += '<tr><th>親メッセージID</th><th>孤立スレッド数</th><th>サンプルID</th></tr>';
                    issue.details.forEach(function(detail) {
                        html += '<tr>';
                        html += '<td>' + detail.parent_message_id + '</td>';
                        html += '<td>' + detail.count + '</td>';
                        html += '<td>' + (detail.sample_ids || 'N/A') + '</td>';
                        html += '</tr>';
                    });
                    html += '</table>';
                } else if (key === 'duplicate_members') {
                    html += '<table class="details-table">';
                    html += '<tr><th>チャンネルID</th><th>ユーザーID</th><th>重複数</th></tr>';
                    issue.details.forEach(function(detail) {
                        html += '<tr>';
                        html += '<td>' + detail.channel_id + '</td>';
                        html += '<td>' + detail.user_id + '</td>';
                        html += '<td>' + detail.count + '</td>';
                        html += '</tr>';
                    });
                    html += '</table>';
                }
                
                html += '</div>';
                html += '</details>';
            }
            
            html += '</div>';
            
            if (issue.fix_available && issue.fix_action) {
                detectedIssues.push({
                    action: issue.fix_action,
                    title: issue.title
                });
            }
        });
        
        $results.html(html).show();
    }
    
    /**
     * データベース修復ボタン
     */
    $(document).on('click', '#repair-database', function() {
        var $button = $(this);
        var $progress = $('#repair-progress');
        var $results = $('#repair-results');
        var $repairSection = $('#repair-section');
        
        if (!confirm('データベースの修復を実行しますか？\n\nこの操作は元に戻すことができません。')) {
            return;
        }
        
        $button.prop('disabled', true);
        $repairSection.hide();
        $progress.show();
        $results.empty().hide();
        
        $.ajax({
            url: lms_chat_admin.ajax_url,
            type: 'POST',
            data: {
                action: 'lms_chat_fix_integrity',
                nonce: lms_chat_admin.nonce
            },
            success: function(response) {
                $progress.hide();
                
                var html = '<h3>修復結果</h3>';
                
                if (response.success) {
                    html += '<div class="notice notice-success">';
                    html += '<p><span class="dashicons dashicons-yes-alt"></span> ' + response.message + '</p>';
                    html += '</div>';
                    
                    if (response.results && response.results.length > 0) {
                        html += '<div class="repair-details">';
                        html += '<h4>修復の詳細</h4>';
                        html += '<table class="repair-results-table">';
                        html += '<tr><th>修復アクション</th><th>処理件数</th><th>状態</th></tr>';
                        
                        response.results.forEach(function(result) {
                            var statusIcon = result.success ? 'dashicons-yes-alt' : 'dashicons-no';
                            var statusClass = result.success ? 'success' : 'error';
                            var statusText = result.success ? '成功' : '失敗';
                            
                            html += '<tr class="' + statusClass + '">';
                            html += '<td>' + result.action + '</td>';
                            html += '<td>' + (result.count || 0) + '</td>';
                            html += '<td><span class="dashicons ' + statusIcon + '"></span> ' + statusText + '</td>';
                            html += '</tr>';
                        });
                        
                        html += '</table>';
                        html += '</div>';
                    }
                    
                    setTimeout(function() {
                        $('#run-health-check').click();
                    }, 3000);
                    
                } else {
                    html += '<div class="notice notice-error">';
                    html += '<p><span class="dashicons dashicons-no"></span> 修復中にエラーが発生しました。</p>';
                    html += '</div>';
                    
                    $button.prop('disabled', false);
                }
                
                $results.html(html).show();
            },
            error: function() {
                $progress.hide();
                $button.prop('disabled', false);
                
                var html = '<div class="notice notice-error">';
                html += '<p><span class="dashicons dashicons-no"></span> 修復中に通信エラーが発生しました。</p>';
                html += '</div>';
                
                $results.html(html).show();
            }
        });
    });
    
    /**
     * 個別修復ボタンの処理
     */
    $(document).on('click', '.individual-fix-btn', function() {
        var $button = $(this);
        var action = $button.data('action');
        var title = $button.data('title');
        
        if (!confirm(lms_chat_admin.confirm_individual_fix.replace('%s', title))) {
            return;
        }
        
        $button.prop('disabled', true).html('<span class="dashicons dashicons-update"></span> 修復中...');
        
        $.ajax({
            url: lms_chat_admin.ajax_url,
            type: 'POST',
            data: {
                action: 'lms_chat_fix_individual',
                fix_action: action,
                nonce: lms_chat_admin.nonce
            },
            success: function(response) {
                if (response.success) {
                    var $issueItem = $button.closest('.issue-item');
                    $issueItem.removeClass('notice-error notice-warning').addClass('notice-success');
                    $issueItem.find('h4').html('<span class="dashicons dashicons-yes-alt"></span> ' + title + ' (修復完了)');
                    $issueItem.find('p').first().html(response.message + ' (処理件数: ' + response.count + ')');
                    $button.remove();
                    
                    setTimeout(function() {
                        $('#run-health-check').click();
                    }, 3000);
                } else {
                    $button.prop('disabled', false).html('<span class="dashicons dashicons-admin-tools"></span> この問題を修復');
                }
            },
            error: function() {
                $button.prop('disabled', false).html('<span class="dashicons dashicons-admin-tools"></span> この問題を修復');
            }
        });
    });
});