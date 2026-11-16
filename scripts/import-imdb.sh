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
NC='\033[0m' # No Color

# Logging functions
log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC}  $1"; }

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

# Function to check import status
check_status() {
    local response
    response=$(curl -s -m 30 "${TORBOX_API_URL}/admin/imdb/status" 2>/dev/null) || {
        log_error "Failed to connect to ${TORBOX_API_URL}/admin/imdb/status"
        return 1
    }
    
    local status
    status=$(json_value "running" "$response")
    local imported
    imported=$(json_value "importedRows" "$response")
    local error
    error=$(json_value "error" "$response")
    
    # When import is not running, importedRows in progress is 0.
    # Get the total from datasets[0].importedRows instead.
    if [ "$status" = "false" ] || [ "$status" = "false," ]; then
        imported=$(json_value "datasets[0].importedRows" "$response")
        if [ -z "$imported" ] || [ "$imported" = "null" ]; then
            imported="0"
        fi
    fi
    
    echo "${status}|${imported}|${error}"
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
    echo "Monitoring import progress..."
    echo "----------------------------------------"
    
    # Monitor progress
    local start_time=$(date +%s)
    local last_imported=0
    
    while true; do
        local status_info
        status_info=$(check_status) || {
            log_error "Failed to get import status"
            return 1
        }
        
        local status=$(echo "$status_info" | cut -d'|' -f1)
        local imported=$(echo "$status_info" | cut -d'|' -f2)
        local error=$(echo "$status_info" | cut -d'|' -f3)
        
        # Update progress display
        if [ -n "$imported" ] && [ "$imported" != "0" ] && [ "$imported" != "$last_imported" ]; then
            elapsed=$(( $(date +%s) - start_time ))
            echo -ne "\r${BLUE}[INFO]${NC} Imported: ${imported} titles | Elapsed: ${elapsed}s"
            last_imported=$imported
        fi
        
        # Check if complete
        if [ "$status" = "false" ] || [ "$status" = "false," ]; then
            echo ""
            if [ -n "$error" ] && [ "$error" != "null" ] && [ "$error" != "" ]; then
                log_error "Import completed with error: ${error}"
                return 1
            fi
            log_success "Import completed successfully!"
            if [ -n "$imported" ] && [ "$imported" != "0" ]; then
                echo "Total titles imported: ${imported}"
            fi
            return 0
        fi
        
        # Check timeout
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        if [ "$elapsed" -ge "$IMPORT_TIMEOUT" ]; then
            echo ""
            log_error "Import did not complete within ${IMPORT_TIMEOUT} seconds"
            return 1
        fi
        
        sleep "$POLL_INTERVAL"
    done
}

# Main execution
main() {
    echo "========================================"
    echo "TorBox Media Manager - IMDb Import"
    echo "========================================"
    echo "Target: ${TORBOX_API_URL}"
    echo "Import Endpoint: ${IMPORT_ENDPOINT}"
    echo "Status Endpoint: ${STATUS_ENDPOINT}"
    echo "Poll Interval: ${POLL_INTERVAL}s"
    echo "Timeout: ${IMPORT_TIMEOUT}s"
    echo "========================================"
    echo ""
    
    run_import "$@"
}

main "$@"
ENDOFJENKINSFILE
echo "Import script created"
chmod +x /Users/guillem/code/torbox-media-manager/scripts/import-imdb.sh
ls -la /Users/guillem/code/torbox-media-manager/scripts/import-imdb.sh
