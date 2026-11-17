#!/bin/bash
# =============================================================================
# TorBox Media Manager - IMDb Import Script
#
# Triggers and monitors IMDb dataset import via the TorBox API.
#
# Usage:
#   ./scripts/import-imdb.sh [BASE_URL]
#
# Environment variables:
#   TORBOX_API_URL   Base URL of the TorBox Media Manager instance
#                    (default: http://localhost:8066)
#   POLL_INTERVAL    Seconds between status polls (default: 30)
#   IMPORT_TIMEOUT   Maximum seconds to wait for import (default: 3600)
# =============================================================================

set -euo pipefail

# Configuration
TORBOX_API_URL="${TORBOX_API_URL:-http://localhost:8066}"
IMPORT_ENDPOINT="${TORBOX_API_URL}/admin/imdb/import"
STATUS_ENDPOINT="${TORBOX_API_URL}/admin/imdb/status"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
IMPORT_TIMEOUT="${IMPORT_TIMEOUT:-3600}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC}  $1"; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $1"; }

# Timestamp helper
ts() { date '+%Y-%m-%d %H:%M:%S'; }

# Check if curl is available
if ! command -v curl &> /dev/null; then
    log_error "curl is not installed. Please install curl to use this script."
    exit 1
fi

# Check if jq is available (optional, for nicer JSON output)
HAS_JQ=false
if command -v jq &> /dev/null; then
    HAS_JQ=true
fi

# Function to extract value from JSON (with or without jq)
json_value() {
    local key="$1"
    local json="$2"
    if [ "$HAS_JQ" = true ]; then
        echo "$json" | jq -r ".${key}" 2>/dev/null || echo ""
    else
        # Fallback: simple grep/sed extraction
        echo "$json" | grep -o "\"${key}\": *[^,}]*" | head -1 | sed 's/.*: *//' | tr -d '"' || echo ""
    fi
}

# Function to check import status - returns detailed pipe-delimited info
# Format: running|dataset|importedRows|error|dataset1:rows1,dataset2:rows2
check_status() {
    local response
    response=$(curl -s -m 30 "${TORBOX_API_URL}/admin/imdb/status" 2>/dev/null) || {
        log_error "Failed to connect to ${TORBOX_API_URL}/admin/imdb/status"
        return 1
    }

    local running dataset imported error
    running=$(json_value "progress.running" "$response")
    dataset=$(json_value "progress.dataset" "$response")
    imported=$(json_value "progress.importedRows" "$response")
    error=$(json_value "progress.error" "$response")

    # Build completed datasets summary: title.basics.tsv.gz:123456,title.ratings.tsv.gz:789012
    local datasets_summary=""
    if [ "$HAS_JQ" = true ]; then
        datasets_summary=$(echo "$response" | jq -r '[.datasets[] | "\(.dataset):\(.importedRows)"] | join(",")' 2>/dev/null || echo "")
    else
        # Without jq we can't reliably parse the datasets array; leave summary empty.
        datasets_summary=""
    fi

    [ -z "$running" ] && running="false"
    [ -z "$dataset" ] && dataset="—"
    [ -z "$imported" ] && imported="0"
    [ -z "$error" ] && error=""

    echo "${running}|${dataset}|${imported}|${error}|${datasets_summary}"
    return 0
}

# Function to trigger import
trigger_import() {
    local response
    response=$(curl -s -m 30 -X POST "${IMPORT_ENDPOINT}" 2>/dev/null) || {
        log_error "Failed to connect to ${IMPORT_ENDPOINT}"
        return 1
    }

    local status
    status=$(json_value "status" "$response")
    echo "$status"
    return 0
}

# Main import function
run_import() {
    log_info "Starting IMDb import..."
    log_info "Target: ${TORBOX_API_URL}"
    log_info "Import endpoint: ${IMPORT_ENDPOINT}"
    log_info "Status endpoint: ${STATUS_ENDPOINT}"
    log_info "Poll interval: ${POLL_INTERVAL}s | Timeout: ${IMPORT_TIMEOUT}s"
    echo ""

    # Trigger import
    local result
    result=$(trigger_import) || {
        log_error "Failed to start import"
        return 1
    }

    echo "Import response: ${result}"
    echo ""

    # Check if import was already running
    if echo "$result" | grep -q "running"; then
        log_warn "Import is already running. Will monitor existing import."
    elif echo "$result" | grep -q "started"; then
        log_success "Import started successfully."
    else
        log_warn "Unexpected response: ${result}"
    fi

    echo ""
    log_step "Monitoring import progress (Ctrl+C to stop monitoring — import continues server-side)..."
    echo "----------------------------------------"

    # Monitor progress
    local start_time=$(date +%s)
    local last_imported=0
    local last_dataset=""
    local last_error=""
    local poll_count=0

    while true; do
        local status_info
        status_info=$(check_status) || {
            log_error "Failed to get import status — retrying in ${POLL_INTERVAL}s..."
            sleep "$POLL_INTERVAL"
            continue
        }

        local running dataset imported error datasets_summary
        running=$(echo "$status_info" | cut -d'|' -f1)
        dataset=$(echo "$status_info" | cut -d'|' -f2)
        imported=$(echo "$status_info" | cut -d'|' -f3)
        error=$(echo "$status_info" | cut -d'|' -f4)
        datasets_summary=$(echo "$status_info" | cut -d'|' -f5-)

        [ -z "$imported" ] && imported="0"
        [ -z "$dataset" ] && dataset="—"

        local now=$(date +%s)
        local elapsed=$((now - start_time))

        # Detect dataset change
        if [ "$dataset" != "$last_dataset" ] && [ -n "$last_dataset" ]; then
            echo ""
            log_step "Dataset changed: ${last_dataset} → ${dataset}"
            last_imported=0
        fi
        last_dataset="$dataset"

        # Detect new error (skip empty and JSON "null" values)
        if [ -n "$error" ] && [ "$error" != "null" ] && [ "$error" != "$last_error" ]; then
            echo ""
            log_error "Import error reported: ${error}"
            last_error="$error"
        fi

        # Print a full status line on the first poll, then update in place
        local rate="0"
        if [ "$elapsed" -gt 0 ]; then
            rate=$(( imported / elapsed ))
        fi

        # Completed datasets detail
        local completed_detail=""
        if [ -n "$datasets_summary" ]; then
            IFS=',' read -ra ds_parts <<< "$datasets_summary"
            for part in "${ds_parts[@]}"; do
                local ds_name="${part%%:*}"
                local ds_rows="${part##*:}"
                completed_detail="  ${ds_name}: ${ds_rows} titles"
                printf '\r%s[%s]%s %s: %s titles | %s | Elapsed: %ss | ~%s titles/s' "${CYAN}" "$(ts)" "${NC}" "${dataset}" "${imported}" "${completed_detail}" "${elapsed}" "${rate}"
            done
        else
            printf '\r%s[%s]%s %s: %s titles | Elapsed: %ss | ~%s titles/s' "${CYAN}" "$(ts)" "${NC}" "${dataset}" "${imported}" "${elapsed}" "${rate}"
        fi

        last_imported="$imported"
        poll_count=$((poll_count + 1))

        # Print a fresh full line every 10 polls so the log doesn't get lost
        if [ $((poll_count % 10)) -eq 0 ]; then
            echo ""
        fi

        # Check if complete
        if [ "$running" = "false" ] || [ "$running" = "false," ]; then
            echo ""
            if [ -n "$error" ] && [ "$error" != "null" ] && [ "$error" != "" ]; then
                log_error "Import completed with error: ${error}"
                return 1
            fi
            log_success "Import completed successfully!"
            echo "  Final dataset: ${dataset}"
            echo "  Total titles imported: ${imported}"
            echo "  Elapsed: ${elapsed}s"
            if [ -n "$datasets_summary" ]; then
                echo "  Per-dataset summary: ${datasets_summary}"
            fi
            return 0
        fi

        # Check timeout
        if [ "$elapsed" -ge "$IMPORT_TIMEOUT" ]; then
            echo ""
            log_error "Import did not complete within ${IMPORT_TIMEOUT} seconds"
            log_info "Last known state: ${dataset}: ${imported} titles"
            return 1
        fi

        sleep "$POLL_INTERVAL"
    done
}

# Main execution
main() {
    echo "=============================================="
    echo "TorBox Media Manager - IMDb Import"
    echo "=============================================="
    echo "Target:          ${TORBOX_API_URL}"
    echo "Import endpoint: ${IMPORT_ENDPOINT}"
    echo "Status endpoint: ${STATUS_ENDPOINT}"
    echo "Poll interval:   ${POLL_INTERVAL}s"
    echo "Timeout:         ${IMPORT_TIMEOUT}s"
    echo "=============================================="
    echo ""

    run_import "$@"
}

main "$@"
