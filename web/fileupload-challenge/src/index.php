<?php
/**
 * PaperTrail — internal document register (presentation shell).
 *
 * Logic-light: renders the static app skeleton and hands off to
 * assets/js/app.js, which talks to the endpoints in api/.
 */
require_once __DIR__ . '/lib/config.php';
$tags = TAGS;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PaperTrail — Document Register</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="shell">

    <!-- Sidebar -------------------------------------------------------- -->
    <aside class="sidebar">
        <div class="brand">
            <span class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="34" height="34" fill="none">
                    <rect x="1" y="1" width="30" height="30" rx="8" fill="#16233b"/>
                    <path d="M11 8h7l5 5v11a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke="#a97b2c" stroke-width="1.5" stroke-linejoin="round"/>
                    <path d="M18 8v5h5" stroke="#a97b2c" stroke-width="1.5" stroke-linejoin="round"/>
                    <path d="M13 17h6M13 20h6" stroke="#e3e6eb" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </span>
            <span class="brand-name">PaperTrail</span>
        </div>

        <button class="workspace" type="button">
            <span class="workspace-badge">MG</span>
            <span class="workspace-text">
                <strong>Meridian Group</strong>
                <span>Operations register</span>
            </span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 9 4-4 4 4M8 15l4 4 4-4"/></svg>
        </button>

        <nav class="nav">
            <button class="nav-item active" data-view="all">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                <span>All documents</span>
                <span class="nav-count" id="count-all">0</span>
            </button>
            <button class="nav-item" data-view="recent">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                <span>Added this week</span>
                <span class="nav-count" id="count-recent">0</span>
            </button>
        </nav>

        <div class="nav-heading">Categories</div>
        <nav class="nav" id="category-nav">
            <?php foreach ($tags as $t): ?>
                <button class="nav-item" data-view="category" data-category="<?= htmlspecialchars($t, ENT_QUOTES) ?>">
                    <span class="cat-dot cat-<?= strtolower($t) ?>"></span>
                    <span><?= htmlspecialchars($t, ENT_QUOTES) ?></span>
                    <span class="nav-count" data-count-for="<?= htmlspecialchars($t, ENT_QUOTES) ?>">0</span>
                </button>
            <?php endforeach; ?>
        </nav>

        <div class="storage">
            <div class="storage-head">
                <span>Storage</span>
                <span id="storage-label">— of 5 GB</span>
            </div>
            <div class="storage-track"><div class="storage-fill" id="storage-fill"></div></div>
        </div>
    </aside>

    <!-- Main ----------------------------------------------------------- -->
    <div class="main">
        <header class="topbar">
            <label class="search">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="search" id="search" placeholder="Search documents by name" autocomplete="off">
            </label>
            <div class="top-actions">
                <button class="btn btn-primary" id="open-upload">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    New document
                </button>
                <span class="avatar" title="Jordan Meyer">JM</span>
            </div>
        </header>

        <div class="workspace-grid">
            <section class="library">
                <div class="page-head">
                    <div>
                        <h1 id="library-title">All documents</h1>
                        <p class="page-sub" id="library-sub">Every document filed in the register.</p>
                    </div>
                    <div class="library-tools">
                        <div class="select-wrap">
                            <select id="sort" aria-label="Sort documents">
                                <option value="date">Newest first</option>
                                <option value="name">Name A–Z</option>
                                <option value="size">Largest first</option>
                            </select>
                        </div>
                        <div class="view-toggle" role="group" aria-label="View">
                            <button class="vt active" data-viewmode="list" aria-label="List view">
                                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
                            </button>
                            <button class="vt" data-viewmode="grid" aria-label="Grid view">
                                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="library-body" id="library-body"><!-- list or grid injected here --></div>

                <div class="empty" id="empty" hidden>
                    <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>
                    <h3 id="empty-title">No documents yet</h3>
                    <p id="empty-text">Upload your first file to start the register.</p>
                    <button class="btn btn-primary" id="empty-upload">New document</button>
                </div>
            </section>

            <aside class="rail">
                <div class="rail-card">
                    <h3 class="rail-title">Overview</h3>
                    <dl class="overview">
                        <div><dt>Documents</dt><dd id="ov-count">0</dd></div>
                        <div><dt>Storage used</dt><dd id="ov-storage">0</dd></div>
                        <div><dt>Last upload</dt><dd id="ov-recent">—</dd></div>
                    </dl>
                </div>
                <div class="rail-card">
                    <h3 class="rail-title">Recent activity</h3>
                    <ul class="activity" id="activity">
                        <li class="activity-empty">Nothing has happened yet.</li>
                    </ul>
                </div>
            </aside>
        </div>
    </div>
</div>

<!-- Upload dialog -------------------------------------------------------- -->
<div class="modal" id="upload-modal" hidden>
    <div class="modal-backdrop" data-close></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div class="modal-head">
            <h3 id="upload-title">New document</h3>
            <button class="icon-btn" data-close aria-label="Close">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
        <form id="upload-form">
            <div class="dropzone" id="dropzone" tabindex="0">
                <input type="file" id="file-input" name="document" hidden>
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>
                <p class="dz-primary">Drop a file here, or <span class="dz-browse">choose a file</span></p>
                <p class="dz-secondary">PDF, DOCX, TXT or MD, up to 5 MB</p>
                <p class="dz-file" id="dz-file" hidden></p>
            </div>
            <div class="field">
                <label for="tag-select">Category</label>
                <div class="select-wrap">
                    <select id="tag-select" name="tag">
                        <?php foreach ($tags as $t): ?>
                            <option value="<?= htmlspecialchars($t, ENT_QUOTES) ?>"><?= htmlspecialchars($t, ENT_QUOTES) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <div class="field">
                <label for="desc-input">Notes <span class="optional">optional</span></label>
                <textarea id="desc-input" name="description" rows="3" placeholder="What is this document for?"></textarea>
            </div>
            <div class="progress" id="progress" hidden><div class="progress-bar" id="progress-bar"></div></div>
            <div class="modal-actions">
                <button type="button" class="btn" data-close>Cancel</button>
                <button type="submit" class="btn btn-primary" id="submit-upload" disabled>File document</button>
            </div>
        </form>
    </div>
</div>

<!-- Detail dialog -------------------------------------------------------- -->
<div class="modal" id="detail-modal" hidden>
    <div class="modal-backdrop" data-close></div>
    <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-head">
            <h3 id="detail-name">Document</h3>
            <button class="icon-btn" data-close aria-label="Close">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>
        <div class="detail-body" id="detail-body"></div>
    </div>
</div>

<div class="toasts" id="toasts"></div>

<script src="assets/js/app.js" defer></script>
</body>
</html>
