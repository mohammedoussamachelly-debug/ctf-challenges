<?php
/**
 * PaperTrail — download endpoint (?id=...).
 *
 * Streams a stored document back to the browser as an attachment. Files can
 * also be opened directly under /uploads/, but this route keeps the original
 * filename and a sensible content type for the "Download" button.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/store.php';

store_init();

$id = (string)($_GET['id'] ?? '');
$doc = $id !== '' ? find_document($id) : null;
if ($doc === null) {
    http_response_code(404);
    echo 'Document not found.';
    exit;
}

$path = UPLOAD_DIR . '/' . basename($doc['name']);
if (!is_file($path)) {
    http_response_code(404);
    echo 'File is missing from storage.';
    exit;
}

$types = [
    'pdf'  => 'application/pdf',
    'txt'  => 'text/plain',
    'md'   => 'text/markdown',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
$mime = $types[$doc['ext'] ?? ''] ?? 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($path));
header('Content-Disposition: attachment; filename="' . basename($doc['name']) . '"');
readfile($path);
exit;
