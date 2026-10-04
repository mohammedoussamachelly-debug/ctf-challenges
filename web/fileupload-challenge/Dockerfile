# PaperTrail — document portal
# ---------------------------------------------------------------------------
# Stock PHP + Apache with mod_php, so per-directory .htaccess directives are
# honoured where AllowOverride permits them.
FROM php:8.2-apache

# Apache configuration for the portal.
COPY apache/papertrail.conf /etc/apache2/conf-available/papertrail.conf
RUN a2enconf papertrail

# PHP runtime settings (keep warnings out of responses).
COPY apache/php.ini /usr/local/etc/php/conf.d/papertrail.ini

# Application code.
COPY src/ /var/www/html/

# Runtime-writable directories: the web server stores uploaded documents and
# the JSON metadata here.
RUN mkdir -p /var/www/html/uploads /var/www/html/data \
    && chown -R www-data:www-data /var/www/html/uploads /var/www/html/data \
    && chmod 775 /var/www/html/uploads /var/www/html/data

# The flag lives at the filesystem root, world-readable so the web server user
# can read it. Kept in one place (./flag.txt) for easy changes.
COPY flag.txt /flag.txt
RUN chmod 644 /flag.txt

EXPOSE 80
