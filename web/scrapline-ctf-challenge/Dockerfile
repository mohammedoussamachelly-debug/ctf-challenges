FROM python:3.12-slim
WORKDIR /app

COPY requirements-app.txt .
RUN pip install --no-cache-dir -r requirements-app.txt

COPY app.py .
COPY templates ./templates
COPY static ./static

ENV SCRAPLINE_DB=/app/data/scrapline.db
ENV FLAG="SECURINETS{change_me_before_deploying}"
ENV ADMIN_PASSWORD="change_me_too"

EXPOSE 5000
CMD ["python", "app.py"]
