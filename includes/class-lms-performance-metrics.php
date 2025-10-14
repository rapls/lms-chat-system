<?php
/**
 * LMS Performance Metrics
 * 
 * パフォーマンス計測用のヘルパークラス
 * WP_DEBUGフラグで制御され、本番環境では無効化される
 * 
 * @package LMS Theme
 */

if (!defined('ABSPATH')) {
    exit;
}

class LMS_Performance_Metrics
{
    private static $instance = null;
    private $metrics = [];
    private $enabled = false;
    
    private function __construct()
    {
        // WP_DEBUGが有効な場合のみ計測を有効化
        $this->enabled = defined('WP_DEBUG') && WP_DEBUG;
    }
    
    public static function get_instance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * メトリクス記録開始
     */
    public function start($key)
    {
        if (!$this->enabled) {
            return;
        }
        
        $this->metrics[$key] = [
            'start' => microtime(true),
            'memory_start' => memory_get_usage(true),
        ];
    }
    
    /**
     * メトリクス記録終了
     */
    public function end($key, $metadata = [])
    {
        if (!$this->enabled) {
            return;
        }
        
        if (!isset($this->metrics[$key])) {
            return;
        }
        
        $end_time = microtime(true);
        $end_memory = memory_get_usage(true);
        
        $this->metrics[$key]['end'] = $end_time;
        $this->metrics[$key]['duration'] = ($end_time - $this->metrics[$key]['start']) * 1000; // ms
        $this->metrics[$key]['memory_used'] = $end_memory - $this->metrics[$key]['memory_start'];
        $this->metrics[$key]['metadata'] = $metadata;
        $this->metrics[$key]['timestamp'] = current_time('mysql');
    }
    
    /**
     * カウンターをインクリメント
     */
    public function increment($key, $value = 1)
    {
        if (!$this->enabled) {
            return;
        }
        
        if (!isset($this->metrics[$key])) {
            $this->metrics[$key] = ['count' => 0];
        }
        
        $this->metrics[$key]['count'] += $value;
    }
    
    /**
     * メトリクスを取得
     */
    public function get_metrics()
    {
        return $this->metrics;
    }
    
    /**
     * メトリクスをログに出力
     */
    public function log_metrics()
    {
        if (!$this->enabled) {
            return;
        }
        
        foreach ($this->metrics as $key => $data) {
            if (isset($data['duration'])) {
                error_log(sprintf(
                    '[LMS Metrics] %s: %.2fms (memory: %s)',
                    $key,
                    $data['duration'],
                    size_format($data['memory_used'])
                ));
            } elseif (isset($data['count'])) {
                error_log(sprintf(
                    '[LMS Metrics] %s: %d calls',
                    $key,
                    $data['count']
                ));
            }
        }
    }
    
    /**
     * メトリクスをリセット
     */
    public function reset()
    {
        $this->metrics = [];
    }
    
    /**
     * メトリクスサマリーを取得
     */
    public function get_summary()
    {
        if (!$this->enabled) {
            return [];
        }
        
        $summary = [
            'total_duration' => 0,
            'total_memory' => 0,
            'total_calls' => 0,
            'metrics' => [],
        ];
        
        foreach ($this->metrics as $key => $data) {
            if (isset($data['duration'])) {
                $summary['total_duration'] += $data['duration'];
                $summary['total_memory'] += $data['memory_used'];
                $summary['metrics'][$key] = [
                    'duration' => $data['duration'],
                    'memory' => $data['memory_used'],
                ];
            }
            
            if (isset($data['count'])) {
                $summary['total_calls'] += $data['count'];
            }
        }
        
        return $summary;
    }
}
