# Database Backup & Recovery Manual

This document provides instructions on how to set up, manage, and recover the Alletre database on Hostinger VPS.

## 1. Setup Instructions (One-time)

### Step 1: Configure Environment
Add these variables to your `.env` file on the VPS to enable advanced features:
```bash
BACKUP_ROOT="/home/backups/db"
GCS_BUCKET="gs://your-bucket-name"
BACKUP_NOTIFICATION_WEBHOOK="https://discord.com/api/webhooks/your-id"
```

### Step 2: Set Permissions
Make the script executable:
```bash
chmod +x /home/alletre-backend/scripts/db_backup.sh
```

### Step 3: Configure Cron Job
Open the crontab editor (`crontab -e`) and add this line to schedule the backup at 2:00 AM daily:
```bash
0 2 * * * /bin/bash /home/alletre-backend/scripts/db_backup.sh >> /var/log/alletre-db-backup.log 2>&1
```

---

## 2. Emergency Recovery Guide

Since we use the **Postgres Custom Format (`-Fc`)**, we must use the `pg_restore` command instead of `psql`.

### Scenario A: Restoring to a local database
If you need to restore the full database to how it was yesterday:

1.  **Identify the backup:** Go to `/home/backups/db/daily/` and find the relevant `.dump` file.
2.  **Restore:**
    ```bash
    # --clean drops objects before creating them
    # --if-exists prevents errors during cleanup
    # -d specifies the target database name
    pg_restore --clean --if-exists -d alletre_db_name your_backup_file.dump
    ```

### Scenario B: Server Crash / New Server
If the whole server is gone and you need to restore from the Cloud (GCS):

1.  **Download from Cloud:**
    ```bash
    gsutil cp gs://your-bucket/monthly/filename.dump .
    ```
2.  **Restore:** Follow the `pg_restore` steps in Scenario A.

---

## 3. Cloud Setup (GCS Authorization)

To allow the VPS to upload backups automatically, you must authorize the `gsutil` tool.

1.  **Create a Service Account** in the Google Cloud Console with the role `Storage Object Creator`.
2.  **Download the JSON key** and move it to your VPS (e.g., `/home/alletre-backend/gcp-key.json`).
3.  **Activate the account:**
    ```bash
    gcloud auth activate-service-account --key-file=/home/alletre-backend/gcp-key.json
    ```

---

## 4. Security & Hardening

Since the `.env` file contains your database password, you must ensure other users on the server cannot read it.

1.  **Restrict .env access:**
    ```bash
    chmod 600 /home/alletre-backend/.env
    ```
2.  **Restrict script access:**
    ```bash
    chmod 700 /home/alletre-backend/scripts/db_backup.sh
    ```

---

## 5. Tiered Retention Policy
*   **Daily:** Kept for 7 days (Local VPS only).
*   **Weekly:** Kept for 28 days (Local VPS + **Cloud GCS**).
*   **Monthly:** Kept for 365 days (Local VPS + **Cloud GCS**).

---

## 6. Verification & Alert Testing

### Test the script manually:
```bash
/bin/bash /home/alletre-backend/scripts/db_backup.sh
```

### Test the Failure Alert:
To verify that your Discord/Slack notifications work, run this command which intentionally provides an invalid database URL:
```bash
DATABASE_URL="postgresql://null:null@localhost/wrong_db" /bin/bash /home/alletre-backend/scripts/db_backup.sh
```
---

## 7. Future Scaling

As your database grows beyond 10GB, you may notice that `pg_dump` takes longer. At that scale, you can switch to **Parallel Backups**:
*   **Flag:** Use `-j N` (where N is the number of CPU cores).
*   **Requirement:** Requires switching from a single file to a **Directory Format** (`-Fd`).
*   **Impact:** Significantly faster backups, but higher CPU usage during the process.

For now, the single-file `-Fc` format is the most stable and recommended approach for Alletre.


