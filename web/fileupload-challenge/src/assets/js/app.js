/* PaperTrail — front-end controller
   Fetches the register once, then filters, sorts and renders on the client.
   Endpoints: api/list.php, api/upload.php, api/document.php, api/delete.php
   ------------------------------------------------------------------ */
(function () {
    'use strict';

    const $  = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

    const state = {
        docs: [],
        activity: [],
        view: 'all',        // all | recent | category
        category: null,
        q: '',
        sort: 'date',
        mode: 'list',       // list | grid
        file: null,
    };

    const QUOTA = 5 * 1024 * 1024 * 1024; // 5 GB nominal, for the meter
    const WEEK  = 7 * 24 * 3600;

    // --- Formatting -----------------------------------------------------
    function human(bytes) {
        const u = ['bytes', 'KB', 'MB', 'GB'];
        let i = 0, n = Number(bytes) || 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + u[i];
    }
    function ago(ts) {
        if (!ts) return '—';
        const d = Math.floor(Date.now() / 1000) - ts;
        if (d < 60)     return 'just now';
        if (d < 3600)   return Math.floor(d / 60) + ' min ago';
        if (d < 86400)  return Math.floor(d / 3600) + ' hr ago';
        if (d < WEEK)   return Math.floor(d / 86400) + ' d ago';
        return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    function fullDate(ts) {
        if (!ts) return '—';
        return new Date(ts * 1000).toLocaleString(undefined,
            { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    const ftype = ext => ['pdf', 'docx', 'txt', 'md'].includes(ext) ? ext : 'file';
    const flabel = ext => (ext || 'DOC').toUpperCase().slice(0, 4);
    const catClass = cat => 'cat-' + String(cat || 'Misc').toLowerCase();

    // --- Toast ----------------------------------------------------------
    function toast(msg, kind = '') {
        const el = document.createElement('div');
        el.className = 'toast ' + kind;
        el.innerHTML = `<span>${esc(msg)}</span><span class="tclose">&times;</span>`;
        $('#toasts').appendChild(el);
        const kill = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 180); };
        el.querySelector('.tclose').addEventListener('click', kill);
        setTimeout(kill, 4200);
    }

    // --- Derived views --------------------------------------------------
    function visibleDocs() {
        let docs = state.docs.slice();

        if (state.view === 'recent') {
            const cut = Math.floor(Date.now() / 1000) - WEEK;
            docs = docs.filter(d => (d.uploaded_at || 0) >= cut);
        } else if (state.view === 'category' && state.category) {
            docs = docs.filter(d => (d.tag || 'Misc') === state.category);
        }
        if (state.q) {
            const n = state.q.toLowerCase();
            docs = docs.filter(d => (d.name || '').toLowerCase().includes(n));
        }
        docs.sort((a, b) => {
            if (state.sort === 'name') return (a.name || '').localeCompare(b.name || '');
            if (state.sort === 'size') return (b.size || 0) - (a.size || 0);
            return (b.uploaded_at || 0) - (a.uploaded_at || 0);
        });
        return docs;
    }

    // --- Sidebar / stats ------------------------------------------------
    function renderChrome() {
        const docs = state.docs;
        $('#count-all').textContent = docs.length;
        const cut = Math.floor(Date.now() / 1000) - WEEK;
        $('#count-recent').textContent = docs.filter(d => (d.uploaded_at || 0) >= cut).length;

        $$('#category-nav [data-count-for]').forEach(el => {
            const cat = el.getAttribute('data-count-for');
            el.textContent = docs.filter(d => (d.tag || 'Misc') === cat).length;
        });

        const bytes = docs.reduce((s, d) => s + (Number(d.size) || 0), 0);
        const latest = docs.reduce((m, d) => Math.max(m, d.uploaded_at || 0), 0);
        $('#ov-count').textContent   = docs.length;
        $('#ov-storage').textContent = human(bytes);
        $('#ov-recent').textContent  = latest ? ago(latest) : '—';
        $('#storage-label').textContent = human(bytes) + ' of 5 GB';
        $('#storage-fill').style.width = Math.min(100, bytes / QUOTA * 100).toFixed(2) + '%';

        // Activity
        const act = $('#activity');
        if (!state.activity.length) {
            act.innerHTML = '<li class="activity-empty">Nothing has happened yet.</li>';
        } else {
            act.innerHTML = state.activity.map(e => `
                <li>
                    <span class="dot ${e.action === 'deleted' ? 'del' : 'up'}"></span>
                    <span>${e.action === 'deleted' ? 'Removed' : 'Filed'}
                        <span class="a-name">${esc(e.name)}</span>
                        <time>${ago(e.at)}</time>
                    </span>
                </li>`).join('');
        }
    }

    // --- Library --------------------------------------------------------
    function renderLibrary() {
        const docs = visibleDocs();
        const body = $('#library-body');
        const empty = $('#empty');

        if (!docs.length) {
            body.innerHTML = '';
            empty.hidden = false;
            const filtering = state.q || state.view !== 'all';
            $('#empty-title').textContent = filtering ? 'No documents match' : 'No documents yet';
            $('#empty-text').textContent  = filtering
                ? 'Try another search or category.'
                : 'Upload your first file to start the register.';
            $('#empty-upload').hidden = !!filtering;
            return;
        }
        empty.hidden = true;
        body.innerHTML = state.mode === 'grid' ? gridHTML(docs) : listHTML(docs);
        bindRows();
    }

    function listHTML(docs) {
        return `
        <div class="doc-list">
            <div class="list-headrow">
                <span>Name</span><span>Category</span><span>Size</span><span>Modified</span><span></span>
            </div>
            ${docs.map(d => `
            <div class="doc-row" data-id="${esc(d.id)}">
                <div class="doc-name-cell">
                    <span class="ftype ${ftype(d.ext)}">${flabel(d.ext)}</span>
                    <span style="min-width:0">
                        <span class="doc-name">${esc(d.name)}</span>
                        ${d.description ? `<span class="doc-note">${esc(d.description)}</span>` : ''}
                    </span>
                </div>
                <div class="cell-cat"><span class="chip"><span class="cat-dot ${catClass(d.tag)}"></span>${esc(d.tag || 'Misc')}</span></div>
                <div class="cell-size">${esc(d.size_human || human(d.size))}</div>
                <div class="cell-date">${ago(d.uploaded_at)}</div>
                <button class="row-action" data-del="${esc(d.id)}" aria-label="Remove">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"/></svg>
                </button>
            </div>`).join('')}
        </div>`;
    }

    function gridHTML(docs) {
        return `<div class="doc-grid">${docs.map(d => `
            <div class="card" data-id="${esc(d.id)}">
                <div class="card-top">
                    <span class="ftype ${ftype(d.ext)}">${flabel(d.ext)}</span>
                    <span class="chip"><span class="cat-dot ${catClass(d.tag)}"></span>${esc(d.tag || 'Misc')}</span>
                </div>
                <div class="card-name">${esc(d.name)}</div>
                <div class="card-foot"><span>${esc(d.size_human || human(d.size))}</span><span>${ago(d.uploaded_at)}</span></div>
            </div>`).join('')}</div>`;
    }

    function bindRows() {
        $$('#library-body [data-id]').forEach(el => {
            el.addEventListener('click', e => {
                if (e.target.closest('[data-del]')) return;
                openDetail(el.getAttribute('data-id'));
            });
        });
        $$('#library-body [data-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const d = state.docs.find(x => x.id === btn.getAttribute('data-del'));
                if (d) remove(d.id, d.name);
            });
        });
    }

    // --- Data -----------------------------------------------------------
    async function load() {
        try {
            const res = await fetch('api/list.php');
            const data = await res.json();
            state.docs = (data.documents || []).map(d => ({ ...d, size_human: d.size_human || human(d.size) }));
            state.activity = data.activity || [];
            renderChrome();
            renderLibrary();
        } catch (e) {
            toast('Could not load the register.', 'err');
        }
    }

    // --- Detail ---------------------------------------------------------
    async function openDetail(id) {
        try {
            const res = await fetch('api/document.php?id=' + encodeURIComponent(id));
            const data = await res.json();
            if (!res.ok) throw new Error();
            const d = data.document;
            $('#detail-name').textContent = d.name;
            $('#detail-body').innerHTML = `
                <div class="detail-hero">
                    <span class="ftype ${ftype(d.ext)}">${flabel(d.ext)}</span>
                    <div style="min-width:0">
                        <div class="doc-name">${esc(d.name)}</div>
                        <div class="detail-meta">
                            <span class="chip"><span class="cat-dot ${catClass(d.tag)}"></span>${esc(d.tag || 'Misc')}</span>
                        </div>
                    </div>
                </div>
                <div class="detail-fields">
                    <div class="box"><div class="k">Size</div><div class="v">${esc(d.size_human || human(d.size))}</div></div>
                    <div class="box"><div class="k">Type</div><div class="v">${esc((d.ext || 'document').toUpperCase())}</div></div>
                    <div class="box" style="grid-column:1/-1"><div class="k">Filed</div><div class="v">${esc(fullDate(d.uploaded_at))}</div></div>
                </div>
                <div class="detail-notes">
                    <div class="k">Notes</div>
                    <div class="v">${d.description ? esc(d.description) : '<span style="color:var(--faint)">No notes were added.</span>'}</div>
                </div>
                <div class="detail-actions">
                    <a class="btn btn-primary" href="api/download.php?id=${encodeURIComponent(d.id)}">Download</a>
                    <a class="btn" href="${esc(d.path)}" target="_blank" rel="noopener">Open</a>
                    <button class="btn btn-ghost-danger" id="detail-delete">Remove</button>
                </div>`;
            $('#detail-delete').addEventListener('click', () => remove(d.id, d.name));
            show('#detail-modal');
        } catch (e) {
            toast('Could not open that document.', 'err');
        }
    }

    async function remove(id, name) {
        const body = new FormData();
        body.set('id', id);
        try {
            const res = await fetch('api/delete.php', { method: 'POST', body });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error();
            hide('#detail-modal');
            toast('Removed “' + name + '”.', 'ok');
            load();
        } catch (e) {
            toast('Could not remove that document.', 'err');
        }
    }

    // --- Upload ---------------------------------------------------------
    function pickFile(file) {
        state.file = file;
        const label = $('#dz-file');
        if (file) {
            label.hidden = false;
            label.textContent = file.name + ' — ' + human(file.size);
            $('#submit-upload').disabled = false;
        } else {
            label.hidden = true;
            $('#submit-upload').disabled = true;
        }
    }

    function doUpload(e) {
        e.preventDefault();
        if (!state.file) return;

        const body = new FormData();
        body.set('document', state.file);
        body.set('tag', $('#tag-select').value);
        body.set('description', $('#desc-input').value);

        const bar = $('#progress-bar');
        $('#progress').hidden = false;
        bar.style.width = '0%';
        $('#submit-upload').disabled = true;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'api/upload.php');
        xhr.upload.addEventListener('progress', ev => {
            if (ev.lengthComputable) bar.style.width = Math.round(ev.loaded / ev.total * 100) + '%';
        });
        xhr.addEventListener('load', () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText); } catch (_) {}
            if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
                bar.style.width = '100%';
                toast('Filed “' + data.document.name + '”.', 'ok');
                setTimeout(() => { hide('#upload-modal'); resetUpload(); load(); }, 320);
            } else {
                $('#progress').hidden = true;
                $('#submit-upload').disabled = false;
                toast(data.error || 'Upload failed.', 'err');
            }
        });
        xhr.addEventListener('error', () => {
            $('#progress').hidden = true;
            $('#submit-upload').disabled = false;
            toast('Network error during upload.', 'err');
        });
        xhr.send(body);
    }

    function resetUpload() {
        $('#upload-form').reset();
        pickFile(null);
        $('#progress').hidden = true;
        $('#progress-bar').style.width = '0%';
    }

    // --- Modal helpers --------------------------------------------------
    function show(sel) { $(sel).hidden = false; document.body.style.overflow = 'hidden'; }
    function hide(sel) { $(sel).hidden = true; if (allHidden()) document.body.style.overflow = ''; }
    function allHidden() { return $('#upload-modal').hidden && $('#detail-modal').hidden; }

    // --- Wiring ---------------------------------------------------------
    function selectView(item) {
        $$('.nav-item').forEach(b => b.classList.remove('active'));
        item.classList.add('active');
        state.view = item.dataset.view;
        state.category = item.dataset.category || null;
        const titles = { all: 'All documents', recent: 'Added this week' };
        const subs = {
            all: 'Every document filed in the register.',
            recent: 'Documents filed in the last seven days.',
        };
        $('#library-title').textContent = state.category || titles[state.view] || 'Documents';
        $('#library-sub').textContent = state.category
            ? 'Documents filed under ' + state.category + '.'
            : (subs[state.view] || '');
        renderLibrary();
    }

    function init() {
        // Navigation (main + categories)
        $$('.nav-item').forEach(item => item.addEventListener('click', () => selectView(item)));

        // Search
        let t;
        $('#search').addEventListener('input', e => {
            clearTimeout(t);
            const v = e.target.value.trim();
            t = setTimeout(() => { state.q = v; renderLibrary(); }, 160);
        });

        // Sort + view mode
        $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderLibrary(); });
        $$('.vt').forEach(b => b.addEventListener('click', () => {
            $$('.vt').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            state.mode = b.dataset.viewmode;
            renderLibrary();
        }));

        // Upload modal open/close
        $('#open-upload').addEventListener('click', () => show('#upload-modal'));
        $('#empty-upload').addEventListener('click', () => show('#upload-modal'));
        $$('[data-close]').forEach(el => el.addEventListener('click', () => {
            hide('#upload-modal'); hide('#detail-modal');
        }));
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { hide('#upload-modal'); hide('#detail-modal'); }
        });

        // Dropzone
        const dz = $('#dropzone'), input = $('#file-input');
        dz.addEventListener('click', () => input.click());
        dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
        input.addEventListener('change', () => pickFile(input.files[0] || null));
        ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragging'); }));
        ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragging'); }));
        dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) pickFile(f); });

        $('#upload-form').addEventListener('submit', doUpload);

        load();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
