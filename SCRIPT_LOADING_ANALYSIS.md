# SSE Thread Script Loading Analysis

## Issue Identified

The SSE-only thread script is not loading correctly due to **script dependency conflicts and duplicate enqueuing**.

## Root Cause

There are TWO functions that enqueue scripts on the same `wp_enqueue_scripts` hook:

1. `lms_scripts()` - Line ~500 in functions.php
2. `lms_enqueue_chat_assets()` - Line ~1900 in functions.php

Both functions enqueue chat-related scripts, but with different dependency orders:

### In `lms_scripts()`:
```php
// WRONG ORDER - lms-chat loads AFTER lms-chat-threads
wp_enqueue_script('lms-chat-threads', ..., array('jquery', 'lms-chat', ...));  // Depends on lms-chat
wp_enqueue_script('lms-chat-threads-sse-only', ..., array('lms-chat-threads'));
wp_enqueue_script('lms-chat', ..., array('jquery', 'lms-chat-core', ...));  // Loads AFTER threads!
```

### In `lms_enqueue_chat_assets()`:
```php
// CORRECT ORDER - lms-chat loads BEFORE lms-chat-threads
wp_enqueue_script('lms-chat', ..., array('jquery', 'lms-chat-core', ...));
wp_enqueue_script('lms-chat-reactions-*', ...);
wp_enqueue_script('lms-chat-threads', ..., array('jquery', 'lms-chat', ...));
```

## Problem

WordPress dependency system cannot resolve this conflict:
- `lms-chat-threads` claims to depend on `lms-chat`
- But `lms-chat` is enqueued AFTER `lms-chat-threads` in the first function
- This causes dependency resolution failures
- The SSE script may load before its dependencies are ready

## Testing Results

1. ✅ SSE script file exists and has valid syntax
2. ✅ Script is properly enqueued with correct dependencies  
3. ❌ Dependency resolution fails due to circular/invalid dependencies
4. ❌ `window.openThread` function may not be defined consistently
5. ❌ `window.LMSChat.threads` object may not be fully initialized

## Verification Steps Performed

1. **File Existence**: ✅ `/js/chat-threads-sse-only.js` exists
2. **Syntax Check**: ✅ No JavaScript syntax errors
3. **Enqueue Check**: ✅ Script is properly enqueued in functions.php
4. **Dependency Analysis**: ❌ Found circular dependencies
5. **Loading Order**: ❌ Scripts may load in wrong order due to conflicts

## Recommended Fixes

### Option 1: Remove Duplicate Enqueuing (Recommended)
Remove the duplicate script enqueues from `lms_scripts()` and keep only `lms_enqueue_chat_assets()`.

### Option 2: Fix Dependency Order
Reorder scripts in `lms_scripts()` to ensure correct dependency chain.

### Option 3: Conditional Enqueuing
Add conditions to prevent duplicate enqueuing.

## Test Files Created

1. `test-sse-thread.html` - Basic functionality test
2. `test-sse-loading-order.html` - Loading order simulation test
3. `debug-sse-loading.js` - Debug script for production testing

## Expected Behavior After Fix

1. `window.LMSChat.threads` should be fully initialized
2. `window.openThread` should point to SSE version
3. All dependency functions should be available:
   - `createThreadMessageHtml`
   - `scrollThreadToBottom` 
   - `startThreadPolling`
4. SSE ready event should fire: `sse_threads_ready`