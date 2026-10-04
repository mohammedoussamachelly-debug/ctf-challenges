<?php
/**
 * PaperTrail — delete endpoint.
 *
 * Removes a document's file from uploads/ and drops its metadata record.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/store.php';

store_init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed.'], 405);
}

$id = (string)($_POST['id'] ?? '');
if ($id === '') {
    json_response(['error' => 'Missing document id.'], 400);
}

$doc = remove_document($id);
if ($doc === null) {
    json_response(['error' => 'Document not found.'], 404);
}

// Best-effort removal of the stored file.
$path = UPLOAD_DIR . '/' . basename($doc['name']);
if (is_file($path)) {
    @unlink($path);
}

log_activity('deleted', $doc['name']);

json_response(['ok' => true]);
