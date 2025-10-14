// ブラウザコンソールで実行するデバッグスクリプト
// スレッド内の全メッセージ構造を表示

(function() {
    console.log('=== スレッドメッセージ構造の確認 ===\n');
    
    const $threadMessages = $('.thread-message');
    console.log(`スレッド内のメッセージ数: ${$threadMessages.length}\n`);
    
    const messages = [];
    $threadMessages.each(function() {
        const $this = $(this);
        const messageId = $this.data('message-id') || $this.attr('data-message-id');
        const parentId = $this.data('parent-message-id') || 
                        $this.data('parent-id') || 
                        $this.attr('data-parent-message-id') ||
                        $this.attr('data-parent-id');
        const messageText = $this.find('.message-text, .message-content').first().text().trim().substring(0, 30);
        
        messages.push({
            messageId: messageId,
            parentId: parentId,
            text: messageText,
            hasDeleteButton: $this.find('.delete-thread-message, .delete-parent-message').length > 0
        });
    });
    
    console.table(messages);
    
    console.log('\n=== 親子関係の分析 ===');
    const parentCounts = {};
    messages.forEach(msg => {
        if (msg.parentId) {
            if (!parentCounts[msg.parentId]) {
                parentCounts[msg.parentId] = [];
            }
            parentCounts[msg.parentId].push(msg.messageId);
        }
    });
    
    console.log('各親メッセージの子メッセージ一覧:');
    Object.keys(parentCounts).forEach(parentId => {
        console.log(`  親ID ${parentId} → 子: [${parentCounts[parentId].join(', ')}] (${parentCounts[parentId].length}件)`);
    });
    
    console.log('\n=== 推奨アクション ===');
    console.log('上記の表で、削除しようとしているメッセージIDを確認してください。');
    console.log('そのメッセージIDが「親ID」列に表示されているメッセージは、子メッセージを持っています。');
})();
