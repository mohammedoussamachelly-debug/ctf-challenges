"""
Scrapline — a small, intentionally vulnerable notes-sharing app for a CTF challenge.

The vulnerability chain (all three ingredients are load-bearing — remove any
one and the exploit stops working):

  1. POST /notes/share has no CSRF token, and the session cookie is set with
     SameSite=Strict.
  2. GET  /feedback/thanks is public (no login required) and serves a static
     JS file that performs a client-side redirect built from an unvalidated
     `ref` query parameter — vulnerable to path traversal, and reachable with
     zero cookies, which is what lets it survive SameSite=Strict.
  3. /notes/share also accepts GET (via request.values), so a plain
     navigation — which can't carry a request body — can still trigger it.
"""
import os
import sqlite3
import secrets
from functools import wraps
from datetime import datetime, timezone

from flask import Flask, request, session, redirect, url_for, render_template, g, abort
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = os.environ.get("SCRAPLINE_DB", "scrapline.db")
FLAG = os.environ.get("FLAG", "SECURINETS{change_me_before_deploying}")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Adm1n_Only_2038!")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", secrets.token_hex(32)),
    SESSION_COOKIE_NAME="sl_session",
    SESSION_COOKIE_SAMESITE="Strict",  # <-- the protection this challenge defeats
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL;")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL;")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS note_shares (
            note_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            PRIMARY KEY (note_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL
        );
        """
    )
    row = db.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    if row is None:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("admin", generate_password_hash(ADMIN_PASSWORD)),
        )
        admin_id = cur.lastrowid
        db.execute(
            "INSERT INTO notes (owner_id, title, content) VALUES (?, ?, ?)",
            (admin_id, "internal-audit.txt", f"Internal audit notes.\n\n{FLAG}"),
        )
    db.commit()
    db.close()


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return get_db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


# ---------------------------------------------------------------- auth ----

@app.route("/")
def index():
    return redirect(url_for("notes") if current_user() else url_for("login"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if not username or not password:
            return render_template("register.html", error="Username and password required.")
        db = get_db()
        try:
            db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
            db.commit()
        except sqlite3.IntegrityError:
            return render_template("register.html", error="Username already taken.")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            return redirect(url_for("notes"))
        return render_template("login.html", error="Invalid credentials.")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# --------------------------------------------------------------- notes ----

@app.route("/notes")
@login_required
def notes():
    user = current_user()
    db = get_db()
    owned = db.execute("SELECT * FROM notes WHERE owner_id = ?", (user["id"],)).fetchall()
    shared = db.execute(
        """
        SELECT notes.* FROM notes
        JOIN note_shares ON notes.id = note_shares.note_id
        WHERE note_shares.user_id = ?
        """,
        (user["id"],),
    ).fetchall()
    return render_template("notes.html", user=user, owned=owned, shared=shared)


@app.route("/notes/new", methods=["GET", "POST"])
@login_required
def new_note():
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        content = request.form.get("content", "").strip()
        if title and content:
            db = get_db()
            db.execute(
                "INSERT INTO notes (owner_id, title, content) VALUES (?, ?, ?)",
                (current_user()["id"], title, content),
            )
            db.commit()
        return redirect(url_for("notes"))
    return render_template("new_note.html")


# THE VULNERABLE ENDPOINT.
# No CSRF token, and it accepts GET as well as POST (request.values merges
# query-string args and form body), which is exactly what lets a plain
# navigation — no request body possible — still trigger it.
@app.route("/notes/share", methods=["GET", "POST"])
@login_required
def share_note():
    note_id = request.values.get("note_id", type=int)
    username = request.values.get("username", "").strip()
    user = current_user()
    db = get_db()
    note = db.execute(
        "SELECT * FROM notes WHERE id = ? AND owner_id = ?", (note_id, user["id"])
    ).fetchone()
    if note is None:
        return "Note not found or not owned by you.", 404
    target = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if target is None:
        return "User not found.", 404
    db.execute(
        "INSERT OR IGNORE INTO note_shares (note_id, user_id) VALUES (?, ?)",
        (note["id"], target["id"]),
    )
    db.commit()
    return f"Note '{note['title']}' shared with {username}."


# --------------------------------------------- public gadget: feedback ----

@app.route("/feedback", methods=["GET", "POST"])
def feedback():
    if request.method == "POST":
        message = request.form.get("message", "").strip()
        if not message:
            return render_template("feedback_form.html", error="Message required.")
        db = get_db()
        cur = db.execute(
            "INSERT INTO feedback (message, created_at) VALUES (?, ?)",
            (message, datetime.now(timezone.utc).isoformat()),
        )
        db.commit()
        return redirect(url_for("feedback_thanks", ref=cur.lastrowid))
    return render_template("feedback_form.html")


@app.route("/feedback/thanks")
def feedback_thanks():
    # Deliberately does NOT check auth and does NOT validate `ref` server-side —
    # the redirect happens entirely client-side, in confirm_redirect.js.
    return render_template("feedback_thanks.html")


@app.route("/f/<int:fid>")
def view_feedback(fid):
    row = get_db().execute("SELECT * FROM feedback WHERE id = ?", (fid,)).fetchone()
    if row is None:
        abort(404)
    return render_template("feedback_view.html", feedback=row)


# ------------------------------------------ report-a-link (bot's queue) ----

@app.route("/report", methods=["GET", "POST"])
@login_required
def report():
    if request.method == "POST":
        url = request.form.get("url", "").strip()
        if url:
            db = get_db()
            db.execute(
                "INSERT INTO reports (url, status, created_at) VALUES (?, 'pending', ?)",
                (url, datetime.now(timezone.utc).isoformat()),
            )
            db.commit()
        return render_template("report.html", submitted=True, user=current_user())
    return render_template("report.html", submitted=False, user=current_user())


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
