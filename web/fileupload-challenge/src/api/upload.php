<?php
/**
 * PaperTrail — upload endpoint.
 *
 * Accepts a document plus its tag and an optional description, stores the file
 * under uploads/ and records its metadata. Documents are meant to be PDF /
 * DOCX / TXT / MD; the portal turns away anything that looks executable.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/store.php';

store_init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['error' => 'Method not allowed.'], 405);
}

if (!isset($_FILES['document'])) {
    json_response(['error' => 'No file was submitted.'], 400);
}

$file = $_FILES['document'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    json_response(['error' => 'Upload failed. Please try again.'], 400);
}

if ($file['size'] <= 0) {
    json_response(['error' => 'That file appears to be empty.'], 400);
}

if ($file['size'] > MAX_UPLOAD_BYTES) {
    json_response(['error' => 'File is too large (5 MB maximum).'], 400);
}

$name = basename($file['name']);
if ($name === '') {
    json_response(['error' => 'Missing filename.'], 400);
}

// Screen the file by its extension so scripts can't be stored in the library.
$ext = file_extension($name);
if (in_array($ext, BLOCKED_EXTENSIONS, true)) {
    json_response(['error' => 'That file type is not supported.'], 400);
}

// Persist the document under its original name.
if (!is_dir(UPLOAD_DIR)) {
    @mkdir(UPLOAD_DIR, 0775, true);
}
$dest = UPLOAD_DIR . '/' . $name;
if (!@move_uploaded_file($file['tmp_name'], $dest)) {
    json_response(['error' => 'Could not save the document.'], 500);
}

// Tag + description from the form.
$tag = $_POST['tag'] ?? 'Misc';
if (!in_array($tag, TAGS, true)) {
    $tag = 'Misc';
}
$description = trim((string)($_POST['description'] ?? ''));
if (strlen($description) > 2000) {
    $description = substr($description, 0, 2000);
}

$record = [
    'id'          => bin2hex(random_bytes(8)),
    'name'        => $name,
    'ext'         => $ext,
    'size'        => (int)$file['size'],
    'tag'         => $tag,
    'description' => $description,
    'uploaded_at' => time(),
    'path'        => 'uploads/' . $name,
];

add_document($record);
log_activity('uploaded', $name);

json_response([
    'ok'       => true,
    'document' => $record,
    'path'     => $record['path'],
]);
