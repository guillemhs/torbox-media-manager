/*
 * TorBox Media Manager - Jenkinsfile for IMDb Import
 * 
 * This Jenkinsfile automates the regular import of IMDb datasets into the
 * TorBox Media Manager database. It triggers the /admin/imdb/import endpoint
 * and monitors the import progress until completion.
 *
 * Usage:
 *   - Scheduled: Runs weekly on Sundays at 02:00 UTC
   - Manual: Trigger manually via Jenkins UI with optional parameters
 *
 * Required Jenkins credentials:
 *   - TORBOX_API_URL: Base URL of the TorBox Media Manager instance
 *                        (e.g., http://your-server:8066)
 *   - TORBOX_API_KEY: Optional authentication token if auth is enabled
 *
 * Required environment variables on the Jenkins agent:
 *   - TORBOX_API_URL: Base URL of the TorBox Media Manager instance
 *   - TORBOX_API_KEY: Optional authentication token if auth is enabled
 *
 * Deployment target: /opt/torbox-media-manager
 */

pipeline {
    agent any

    parameters {
        // Allow manual trigger with optional override
        booleanParam(name: 'FORCE_IMPORT', defaultValue: false, description: 'Force import even if data is up to date')
        stringParam(name: 'TORBOX_URL', defaultValue: 'http://localhost:8066', description: 'TorBox Media Manager URL (e.g., http://localhost:8066)')
        booleanParam(name: 'SEND_NOTIFICATIONS', defaultValue: true, description: 'Send email notifications on completion')
    }

    environment {
        // TorBox API configuration
        TORBOX_API_URL = "${TORBOX_URL ?: env.TORBOX_API_URL ?: 'http://localhost:8066'}"
        TORBOX_IMPORT_ENDPOINT = "${TORBOX_API_URL}/admin/imdb/import"
        TORBOX_IMPORT_STATUS = "${TORBOX_API_URL}/admin/imdb/status"
        
        // Timeout settings (in seconds)
        IMPORT_TIMEOUT = '3600'  // 1 hour max for import
        POLL_INTERVAL = '30'     // Poll status every 30 seconds
        
        // Notification settings
        NOTIFY_SUCCESS = "${SEND_NOTIFICATIONS}"
        NOTIFY_FAILURE = "${SEND_NOTIFICATIONS}"
        
        // Notification configuration (configure in Jenkins)
        NOTIFY_TO = ''
        
        // Workspace directory
        TORBOX_HOME = '/opt/torbox-media-manager'
    }

    options {
        // Retry the entire pipeline once on failure
        retry(1)
        
        // Timeout the entire pipeline
        timeout(time: 2, unit: 'HOURS')
        
        // Disable resume for simplicity
        disableResume()
        
        // Clean workspace before each run
        cleanWhenAlways()
        
        // Timestamps in console output
        timestamps()
    }

    stages {
        stage('Pre-flight Checks') {
            steps {
                script {
                    echo "========================================"
                    echo "TorBox Media Manager - IMDb Import"
                    echo "========================================"
                    echo "TorBox API URL: ${TORBOX_API_URL}"
                    echo "Import Endpoint: ${TORBOX_IMPORT_ENDPOINT}"
                    echo "Force Import: ${FORCE_IMPORT}"
                    echo "Build Number: ${BUILD_NUMBER}"
                    echo "Build ID: ${BUILD_ID}"
                    echo "Build Date: ${new Date()}"
                    echo "Target Directory: ${TORBOX_HOME}"
                    echo "========================================"
                }
            }
        }

        stage('Check Import Status') {
            steps {
                script {
                    echo "Checking current IMDb import status..."
                    
                    def statusResponse = httpRequest(
                        url: "${TORBOX_IMPORT_STATUS}",
                        httpMethod: 'GET',
                        contentType: 'APPLICATION_JSON',
                        validResponseCodes: '200',
                        timeout: 30
                    )
                    
                    def statusJson = parseJson(statusResponse.content)
                    echo "Current import status: ${statusContent(statusResponse.content)}"
                    
                    if (statusJson.importedTitles != null) {
                        echo "Titles already imported: ${statusJson.importedTitles}"
                    }
                    
                    // Check if import is already running
                    if (statusJson.running == true) {
                        echo "WARNING: An IMDb import is already running."
                        if (FORCE_IMPORT == 'true') {
                            echo "FORCE_IMPORT is true - proceeding anyway."
                        } else {
                            error("Import already in progress. Set FORCE_IMPORT=true to override.")
                        }
                    }
                }
            }
        }

        stage('Trigger IMDb Import') {
            steps {
                script {
                    echo "Triggering IMDb import via POST ${TORBOX_IMPORT_ENDPOINT}..."
                    
                    def importResponse = httpRequest(
                        url: "${TORBOX_IMPORT_ENDPOINT}",
                        httpMethod: 'POST',
                        contentType: 'APPLICATION_JSON',
                        validResponseCodes: '200, 202',
                        timeout: 30
                    )
                    
                    def importResult = parseJson(importResponse.content)
                    echo "Import response: ${importResponse.content}"
                    
                    if (importResponse.status == 202) {
                        echo "Import started successfully."
                        echo "Status: ${importResult.status}"
                        if (importResult.torrentCount != null) {
                            echo "Torrents before import: ${importResult.torrentCount}"
                        }
                    } else {
                        error("Unexpected response status: ${importResponse.status}")
                    }
                }
            }
        }

        stage('Monitor Import Progress') {
            steps {
                script {
                    def maxAttempts = (IMPORT_TIMEOUT as Integer) / (POLL_INTERVAL as Integer)
                    int attempt = 0
                    boolean importComplete = false
                    String lastStatus = ''
                    
                    echo "Monitoring import progress (polling every ${POLL_INTERVAL}s, max ${IMPORT_TIMEOUT}s)..."
                    
                    while (!importComplete && attempt < maxAttempts) {
                        attempt++
                        
                        try {
                            def statusResponse = httpRequest(
                                url: "${TORBOX_IMPORT_STATUS}",
                                httpMethod: 'GET',
                                contentType: 'APPLICATION_JSON',
                                validResponseCodes: '200',
                                timeout: 30
                            )
                            
                            def statusJson = parseJson(statusResponse.content)
                            
                            def currentStatus = "${statusJson.importedItems ?: 0} items imported"
                            if (statusJson.error) {
                                currentStatus += " (error: ${statusJson.error})"
                            }
                            
                            if (currentStatus != lastStatus) {
                                echo "[Attempt ${attempt}/${maxAttempts}] ${currentStatus}"
                                lastStatus = currentStatus
                            }
                            
                            // Check if import is complete
                            if (statusJson.running == false) {
                                echo "Import completed."
                                importComplete = true
                                
                                if (statusJson.error) {
                                    error("Import completed with error: ${statusJson.error}")
                                }
                                
                                echo "Import completed successfully."
                                if (statusJson.importedItems != null) {
                                    echo "Total titles imported: ${statusJson.importedItems}"
                                }
                                break
                            }
                            
                        } catch (error) {
                            echo "Warning: Status check failed: ${error.getMessage()}"
                            // Don't fail immediately - might be a temporary network issue
                        }
                        
                        sleep(time: POLL_INTERVAL as Integer, unit: 'SECONDS')
                    }
                    
                    if (!importComplete) {
                        error("Import did not complete within ${IMPORT_TIMEOUT} seconds (${maxAttempts} attempts).")
                    }
                }
            }
        }

        stage('Post-Import Verification') {
            steps {
                script {
                    echo "Verifying import completion..."
                    
                    def statusResponse = httpRequest(
                        url: "${TORBOX_IMPORT_STATUS}",
                        httpMethod: 'GET',
                        contentType: 'APPLICATION_JSON',
                        validResponseCodes: '200',
                        timeout: 30
                    )
                    
                    def statusJson = parseJson(statusResponse.content)
                    echo "Final status: ${statusContent(statusResponse.content)}"
                    
                    if (statusJson.running == true) {
                        error("Import is still running after completion wait period.")
                    }
                    
                    if (statusJson.error) {
                        error("Import completed with error: ${statusJson.error}")
                    }
                    
                    echo "Import verification complete."
                }
            }
        }

        stage('Notify Success') {
            when {
                expression { return NOTIFY_SUCCESS == 'true' }
            }
            steps {
                script {
                    echo "Sending success notification..."
                    
                    def message = """
                    ✅ *TorBox Media Manager - IMDb Import Completed*
                    
                    *Build:* ${env.BUILD_NUMBER} (<${env.BUILD_URL}|View>)
                    *Job:* ${env.JOB_NAME}
                    *Node:* ${env.NODE_NAME}
                    *Time:* ${new Date()}
                    
                    *Import Status:* Completed successfully
                    *Source:* IMDb public datasets
                    *Target:* TorBox Media Manager (${TORBOX_API_URL})
                    
                    Please verify the imported data in the application.
                    """
                    
                    // Send notification via email
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[TorBox] IMDb Import Completed Successfully - Build #${BUILD_NUMBER}",
                        body: message
                    )
                    
                    // Also send to Slack if configured
                    slackSend(
                        color: 'good',
                        message: "*✅ TorBox Media Manager - IMDb Import Completed*\n*Build:* <${env.BUILD_URL}|#${BUILD_NUMBER}>\n*Job:* ${env.JOB_NAME}\n*Status:* Import completed successfully"
                    ) {
                        // Slack integration requires the Slack Notification plugin
                    }
                }
            }
        }

        stage('Notify Failure') {
            when {
                expression { return NOTIFY_FAILURE == 'true' && currentBuild.result != 'SUCCESS' }
            }
            steps {
                script {
                    echo "Sending failure notification..."
                    
                    def errorMessage = currentBuild.getCauses()?.toString() ?: 'Unknown error'
                    
                    def message = """
                    ❌ *TorBox Media Manager - IMDb Import FAILED*
                    
                    *Build:* ${env.BUILD_NUMBER} (<${env.BUILD_URL}|View>)
                    *Job:* ${env.JOB_NAME}
                    *Node:* ${env.NODE_NAME}
                    *Time:* ${new Date()}
                    
                    *Status:* FAILED
                    *Error:* ${errorMessage}
                    
                    Please check the build logs and the application logs for details.
                    """
                    
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[ALERT] TorBox Media Manager - IMDb Import FAILED - Build #${BUILD_NUMBER}",
                        body: message
                    )
                    
                    slackSend(
                        color: 'danger',
                        message: "*❌ TorBox Media Manager - IMDb Import FAILED*\n*Build:* <${env.BUILD_URL}|#${BUILD_NUMBER}>\n*Job:* ${env.JOB_NAME}\n*Status:* FAILED\n*Error:* ${errorMessage}"
                    ) {
                        // Slack integration requires the Slack Notification plugin
                    }
                }
            }
        }

        stage('Notify Aborted') {
            when {
                expression { currentBuild.result == 'ABORTED' }
            }
            steps {
                script {
                    echo "Build was aborted."
                    
                    def message = """
                    ⚠️ *TorBox Media Manager - IMDb Import ABORTED*
                    
                    *Build:* ${env.BUILD_NUMBER} (<${env.BUILD_URL}|View>)
                    *Job:* ${env.JOB_NAME}
                    *Node:* ${env.NODE_NAME}
                    *Time:* ${new Date()}
                    
                    *Status:* ABORTED
                    
                    The import was manually aborted.
                    """
                    
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[WARN] TorBox Media Manager - IMDb Import Aborted - Build #${BUILD_NUMBER}",
                        body: message
                    )
                }
            }
        }

        stage('Notify Unstable') {
            when {
                expression { currentBuild.result == 'UNSTABLE' }
            }
            steps {
                script {
                    echo "Build unstable."
                    
                    def message = """
                    ⚠️ *TorBox Media Manager - IMDb Import UNSTABLE*
                    
                    *Build:* ${env.BUILD_NUMBER} (<${env.BUILD_URL}|View>)
                    *Job:* ${env.JOB_NAME}
                    *Node:* ${env.NODE_NAME}
                    *Time:* ${new Date()}
                    
                    *Status:* UNSTABLE
                    
                    The import completed but with warnings. Please review the logs.
                    """
                    
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[WARN] TorBox Media Manager - IMDb Import Unstable - Build #${BUILD_NUMBER}",
                        body: message
                    )
                }
            }
        }
    }

    post {
        always {
            script {
                echo "=== Build Summary ==="
                echo "Build: ${env.BUILD_NUMBER}"
                echo "Job: ${env.JOB_NAME}"
                echo "Status: ${currentBuild.currentResult}"
                echo "Timestamp: ${new Date()}"
            }
        }
    }
}

/**
 * Helper function to safely parse JSON content
 */
def parseJson(String content) {
    try {
        return new groovy.json.JsonSlurper().parseText(content)
    } catch (e) {
        echo "Warning: Failed to parse JSON: ${content.substring(0, Math.min(200, content.length()))}"
        return [:]
    }
}

/**
 * Helper function to safely get status content for logging
 */
def statusContent(String content) {
    try {
        def json = new groovy.json.JsonSlurper().parseText(content)
        return "running=${json.running}, importedItems=${json.importedItems}, error=${json.error}"
    } catch (e) {
        return content.substring(0, Math.min(200, content.length()))
    }
}
