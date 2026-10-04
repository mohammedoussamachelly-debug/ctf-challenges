<?php
/**
 * PaperTrail — application configuration.
 *
 * Central place for filesystem paths, upload limits and the (intentionally
 * weak) extension filter. Kept separate from presentation and request logic.
 */

declare(strict_types=1);

// --- Filesystem layout ------------------------------------------------------
define('APP_ROOT',    dirname(__DIR__));                 // .../src
define('UPLOAD_DIR',  APP_ROOT . '/uploads');            // stored documents
define('DATA_DIR',    APP_ROOT . '/data');               // JSON metadata store
define('DOCS_FILE',   DATA_DIR . '/documents.json');     // document records
define('ACTIVITY_FILE', DATA_DIR . '/activity.json');    // recent activity log

// --- Upload rules -----------------------------------------------------------
// Documents only, up to ~5 MB each.
define('MAX_UPLOAD_BYTES', 5 * 1024 * 1024);

/**
 * Extensions the portal will not accept. Matched case-insensitively against
 * the part after the final dot in the uploaded filename.
 */
const BLOCKED_EXTENSIONS = [
    'php', 'php2', 'php3', 'php4', 'php5', 'php6', 'php7',
    'phps', 'pht', 'phtml', 'phar',
    'cgi', 'pl', 'py', 'asp', 'aspx', 'jsp', 'sh',
];

/**
 * Tags a document can be filed under. Kept small so the sidebar filter reads
 * cleanly; the upload form offers exactly these.
 */
const TAGS = ['Contracts', 'Invoices', 'Reports', 'HR', 'Marketing', 'Misc'];
