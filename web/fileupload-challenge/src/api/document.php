<?php
/**
 * PaperTrail — single document detail endpoint (?id=...).
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/store.php';

store_init();

$id = (string)($_GET['id'] ?? '');
if ($id === '') {
    json_response(['error' => 'Missing document id.'], 400);
}

$doc = find_document($id);
if ($doc === null) {
    json_response(['error' => 'Document not found.'], 404);
}

$doc['size_human'] = human_size((int)($doc['size'] ?? 0));

json_response(['document' => $doc]);
