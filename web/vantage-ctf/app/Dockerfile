# VANTAGE Procurement Cloud — application image
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/app

# System deps kept minimal; psycopg2-binary ships its own libpq.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Drop privileges inside the container.
RUN useradd --no-create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /srv/app
USER appuser

EXPOSE 5000

# gunicorn in front of Flask; the app retries the DB connection on startup race.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "--timeout", "30", "--access-logfile", "-", "app:app"]
