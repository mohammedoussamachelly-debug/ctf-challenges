<?php
/**
 * PaperTrail — library listing endpoint.
 *
 * Returns documents (optionally filtered by ?q= filename search and ?tag=),
 * the header stats and the recent-activity feed in one call, so the front-end
 * can render the whole dashboard from a single request.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/store.php';

store_init();

$q   = trim((string)($_GET['q'] ?? ''));
$tag = trim((string)($_GET['tag'] ?? ''));

$docs = all_documents();

if ($q !== '') {
    $needle = mb_strtolower($q);
    $docs = array_values(array_filter($docs, function ($d) use ($needle) {
        return str_contains(mb_strtolower($d['name'] ?? ''), $needle);
    }));
}

if ($tag !== '' && $tag !== 'All') {
    $docs = array_values(array_filter($docs, fn($d) => ($d['tag'] ?? '') === $tag));
}

// Decorate each record with a display-friendly size for the client.
$docs = array_map(function ($d) {
    $d['size_human'] = human_size((int)($d['size'] ?? 0));
    return $d;
}, $docs);

$stats = library_stats();

json_response([
    'documents' => $docs,
    'tags'      => TAGS,
    'stats'     => [
        'count'        => $stats['count'],
        'bytes'        => $stats['bytes'],
        'bytes_human'  => human_size($stats['bytes']),
        'latest'       => $stats['latest'],
    ],
    'activity'  => recent_activity(8),
]);
