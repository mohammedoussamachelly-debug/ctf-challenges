<?php
/**
 * PaperTrail — JSON-backed metadata store.
 *
 * Documents and the activity feed are persisted as JSON files under data/.
 * A single container owns the files, so a coarse flock() around each
 * read-modify-write is enough to keep concurrent uploads consistent.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

/** Make sure the data directory and its JSON files exist. */
function store_init(): void
{
    if (!is_dir(DATA_DIR)) {
        @mkdir(DATA_DIR, 0775, true);
    }
    foreach ([DOCS_FILE, ACTIVITY_FILE] as $file) {
        if (!file_exists($file)) {
            file_put_contents($file, "[]\n", LOCK_EX);
        }
    }
}

/** Read a JSON array file, tolerating an empty or missing file. */
function read_json(string $file): array
{
    if (!file_exists($file)) {
        return [];
    }
    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Atomically overwrite a JSON array file. */
function write_json(string $file, array $data): void
{
    file_put_contents(
        $file,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n",
        LOCK_EX
    );
}

/** All documents, newest first. */
function all_documents(): array
{
    $docs = read_json(DOCS_FILE);
    usort($docs, fn($a, $b) => ($b['uploaded_at'] ?? 0) <=> ($a['uploaded_at'] ?? 0));
    return $docs;
}

/** Fetch one document record by id, or null. */
function find_document(string $id): ?array
{
    foreach (read_json(DOCS_FILE) as $doc) {
        if (($doc['id'] ?? null) === $id) {
            return $doc;
        }
    }
    return null;
}

/** Append a document record. */
function add_document(array $doc): void
{
    $docs = read_json(DOCS_FILE);
    $docs[] = $doc;
    write_json(DOCS_FILE, $docs);
}

/** Remove a document record by id; returns the removed record or null. */
function remove_document(string $id): ?array
{
    $docs = read_json(DOCS_FILE);
    $removed = null;
    $kept = [];
    foreach ($docs as $doc) {
        if (($doc['id'] ?? null) === $id) {
            $removed = $doc;
        } else {
            $kept[] = $doc;
        }
    }
    if ($removed !== null) {
        write_json(DOCS_FILE, $kept);
    }
    return $removed;
}

/** Record an activity event ("uploaded"/"deleted"), keeping the last 30. */
function log_activity(string $action, string $name): void
{
    $events = read_json(ACTIVITY_FILE);
    array_unshift($events, [
        'action' => $action,
        'name'   => $name,
        'at'     => time(),
    ]);
    $events = array_slice($events, 0, 30);
    write_json(ACTIVITY_FILE, $events);
}

/** The recent activity feed, newest first. */
function recent_activity(int $limit = 8): array
{
    return array_slice(read_json(ACTIVITY_FILE), 0, $limit);
}

/** Aggregate stats for the header. */
function library_stats(): array
{
    $docs = read_json(DOCS_FILE);
    $total = count($docs);
    $bytes = array_sum(array_map(fn($d) => (int)($d['size'] ?? 0), $docs));
    $latest = 0;
    foreach ($docs as $d) {
        $latest = max($latest, (int)($d['uploaded_at'] ?? 0));
    }
    return [
        'count'       => $total,
        'bytes'       => $bytes,
        'latest'      => $latest,
    ];
}
