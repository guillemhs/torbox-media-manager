/*
 * TorBox Media Manager - Jenkinsfile for IMDb Import
 *
 * Checks out scripts/import-imdb.sh from GitHub and runs it on the selected agent.
 *
 * Usage:
 *   - Scheduled: Runs weekly on Sundays at 02:00 UTC (defaults to 'macmini')
 *   - Manual: Trigger manually via Jenkins UI with optional parameters
 */

pipeline {
    agent { label "${params.AGENT_LABEL ?: 'macmini'}" }

    parameters {
        choice(name: 'AGENT_LABEL', choices: ['macmini', 'built-in'], description: 'Jenkins agent label to run the import on')
        booleanParam(name: 'FORCE_IMPORT', defaultValue: false, description: 'Force import even if an import is already running or data is up to date')
        string(name: 'TORBOX_URL', defaultValue: 'http://localhost:8066', description: 'TorBox Media Manager URL (e.g., http://localhost:8066)')
    }

    environment {
        REPO_URL       = 'https://github.com/guillemhs/torbox-media-manager.git'
        REPO_BRANCH    = 'main'
        TORBOX_API_URL = "${params.TORBOX_URL ?: 'http://localhost:8066'}"
        FORCE_IMPORT   = "${params.FORCE_IMPORT}"
        IMPORT_TIMEOUT = '3600' // 1 hour max for import
        POLL_INTERVAL  = '30'   // Poll status every 30 seconds

        NOTIFY_TO      = ''
        NOTIFY_SUCCESS = 'false'
        NOTIFY_FAILURE = 'false'
    }

    triggers {
        cron('0 2 * * 0')
    }

    options {
        retry(1)
        timeout(time: 2, unit: 'HOURS')
        disableResume()
        timestamps()
        skipDefaultCheckout(true)
    }

    stages {
        stage('Checkout') {
            steps {
                cleanWs()
                git(
                    url: "${REPO_URL}",
                    branch: "${REPO_BRANCH}",
                    changelog: false,
                    poll: false
                )
            }
        }

        stage('Pre-flight Checks') {
            steps {
                script {
                    echo "========================================"
                    echo "TorBox Media Manager - IMDb Import"
                    echo "========================================"
                    echo "Agent Label    : ${params.AGENT_LABEL ?: 'macmini'} (Node: ${env.NODE_NAME})"
                    echo "Repository     : ${REPO_URL} (${REPO_BRANCH})"
                    echo "TorBox API URL : ${TORBOX_API_URL}"
                    echo "Force Import   : ${FORCE_IMPORT}"
                    echo "Build Number   : ${BUILD_NUMBER}"
                    echo "Build Date     : ${new Date()}"
                    echo "========================================"

                    if (!fileExists('scripts/import-imdb.sh')) {
                        error("scripts/import-imdb.sh not found in repository.")
                    }
                }
            }
        }

        stage('Run IMDb Import') {
            steps {
                sh '''
                    chmod +x ./scripts/import-imdb.sh
                    ./scripts/import-imdb.sh http://192.168.1.5:8066
                '''
            }
        }
    }

    post {
        success {
            script {
                if (NOTIFY_SUCCESS == 'true' && NOTIFY_TO) {
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[TorBox] IMDb Import Completed Successfully - Build #${BUILD_NUMBER}",
                        body: """✅ TorBox Media Manager - IMDb Import Completed

Build: ${env.BUILD_NUMBER} (${env.BUILD_URL})
Job: ${env.JOB_NAME}
Node: ${env.NODE_NAME}
Time: ${new Date()}
Target: ${TORBOX_API_URL}
"""
                    )
                }
            }
        }

        failure {
            script {
                if (NOTIFY_FAILURE == 'true' && NOTIFY_TO) {
                    def errorMessage = currentBuild.getCauses()?.toString() ?: 'Unknown error'
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[ALERT] TorBox Media Manager - IMDb Import FAILED - Build #${BUILD_NUMBER}",
                        body: """❌ TorBox Media Manager - IMDb Import FAILED

Build: ${env.BUILD_NUMBER} (${env.BUILD_URL})
Job: ${env.JOB_NAME}
Node: ${env.NODE_NAME}
Time: ${new Date()}
Error: ${errorMessage}

Please check the build logs for details.
"""
                    )
                }
            }
        }

        aborted {
            script {
                if (NOTIFY_TO) {
                    mail(
                        to: "${NOTIFY_TO}",
                        subject: "[WARN] TorBox Media Manager - IMDb Import Aborted - Build #${BUILD_NUMBER}",
                        body: "TorBox Media Manager - IMDb Import ABORTED (Build #${BUILD_NUMBER}: ${env.BUILD_URL})"
                    )
                }
            }
        }

        always {
            echo "=== Build Summary: #${env.BUILD_NUMBER} (${currentBuild.currentResult}) ==="
            cleanWs()
        }
    }
}