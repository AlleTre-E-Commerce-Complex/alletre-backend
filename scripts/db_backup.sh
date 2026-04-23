#!/bin/bash

# ==============================================================================
# Alletre Database Backup Script (Professional Edition)
# ==============================================================================
# Features: Tiered Retention, Custom Format, Off-site Sync, Error Alerts.
# ==============================================================================

# 1. Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$BACKEND_DIR/.env"

# BETTER WAY TO LOAD .ENV (Handles complex keys like Firebase)
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Clean up the DATABASE_URL (Removes Prisma-specific ?schema=public part)
CLEAN_DB_URL=$(echo "$DATABASE_URL" | sed 's/?schema=.*//')

# Variables (Overridable via .env)
BACKUP_ROOT="${BACKUP_ROOT:-/home/backups/db}"
# Self-correction: Strip any existing slash to ensure consistent path format
GCS_BUCKET=$(echo "${GCS_BUCKET:-gs://alletre-db-backups}" | sed 's/\/*$//')
WEBHOOK_URL="${BACKUP_NOTIFICATION_WEBHOOK:-}" # Discord/Slack Webhook URL

# Extract DB name from CLEAN_DB_URL
DB_NAME=$(echo $CLEAN_DB_URL | sed -e 's/.*\///' -e 's/?.*//')

# Timestamps
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_MONTH=$(date +%d)
DAY_OF_WEEK=$(date +%u)

# Paths
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

# 2. Notification Helper
send_notification() {
    local message="$1"
    if [ -n "$WEBHOOK_URL" ]; then
        curl -H "Content-Type: application/json" -X POST -d "{\"content\": \"$message\"}" "$WEBHOOK_URL"
    fi
}

# 3. Perform Backup (Custom Format -Fc)
FILENAME="$DB_NAME-$TIMESTAMP.dump"
BACKUP_PATH="$DAILY_DIR/$FILENAME"

echo "Starting backup for $DB_NAME to $BACKUP_PATH..."

# Use -Fc for custom format (compressed, flexible, fast restore)
# Use --no-owner --no-privileges for portability
# Use CLEAN_DB_URL to avoid Prisma ?schema= errors
pg_dump -Fc --no-owner --no-privileges "$CLEAN_DB_URL" > "$BACKUP_PATH"

if [ $? -eq 0 ]; then
    echo "Successfully created daily backup."
    
    # Tiered Retention Logic
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        cp "$BACKUP_PATH" "$WEEKLY_DIR/$FILENAME"
        echo "Copied to weekly storage."
        
        # Off-Site Sync (Weekly GCS)
        if command -v gsutil &> /dev/null; then
            gsutil cp "$BACKUP_PATH" "$GCS_BUCKET/weekly/$FILENAME"
            echo "Uploaded weekly backup to Cloud Storage."
        fi
    fi

    if [ "$DAY_OF_MONTH" -eq "01" ]; then
        cp "$BACKUP_PATH" "$MONTHLY_DIR/$FILENAME"
        echo "Copied to monthly storage."
        
        # Off-Site Sync (Monthly GCS)
        if command -v gsutil &> /dev/null; then
            gsutil cp "$BACKUP_PATH" "$GCS_BUCKET/monthly/$FILENAME"
            echo "Uploaded monthly backup to Cloud Storage."
        fi
    fi
else
    ERROR_MSG="🚨 **Critical Error**: Database backup for $DB_NAME failed on $(hostname)!"
    echo "$ERROR_MSG"
    send_notification "$ERROR_MSG"
    exit 1
fi

# 4. Clean up old backups
echo "Cleaning up old backups..."
find "$DAILY_DIR" -type f -name "*.dump" -mtime +7 -delete
find "$WEEKLY_DIR" -type f -name "*.dump" -mtime +28 -delete
find "$MONTHLY_DIR" -type f -name "*.dump" -mtime +365 -delete

echo "Cleanup completed. Finished."

