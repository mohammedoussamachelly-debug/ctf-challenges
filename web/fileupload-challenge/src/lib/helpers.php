<?php
/**
 * PaperTrail — small shared helpers used by the API endpoints.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

/** Send a JSON response and stop. */
function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Extract the lower-cased extension (the part after the final dot).
 *
 * Names with no dot, or dotfiles like ".htaccess", have no trailing
 * extension segment and return an empty string.
 */
function file_extension(string $name): string
{
    $name = basename($name);
    $dot = strrpos($name, '.');
    if ($dot === false || $dot === 0) {
        return '';
    }
    return strtolower(substr($name, $dot + 1));
}

/** Friendly human-readable byte size. */
function human_size(int $bytes): string
{
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    $n = (float)$bytes;
    while ($n >= 1024 && $i < count($units) - 1) {
        $n /= 1024;
        $i++;
    }
    return ($i === 0 ? (int)$n : number_format($n, 1)) . ' ' . $units[$i];
}
