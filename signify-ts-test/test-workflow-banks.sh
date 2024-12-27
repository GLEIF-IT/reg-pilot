#!/bin/bash

# Extracted values from resolve-env.ts
WAN='BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha'
WIL='BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM'
WES='BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX'

# Check if TEST_ENVIRONMENT is set
if [ -z "$TEST_ENVIRONMENT" ]; then
    # Default values for 'docker' environment
    : "${TEST_ENVIRONMENT:=docker}"
    : "${REG_PILOT_API:=http://127.0.0.1:8000}"
    : "${VLEI_VERIFIER:=http://127.0.0.1:7676}"
    : "${KERIA:=http://127.0.0.1:3901}"
    : "${KERIA_BOOT:=http://127.0.0.1:3903}"
    : "${VLEI_SERVER:=http://vlei-server:7723}"
fi

# Export environment variables
export TEST_ENVIRONMENT REG_PILOT_API REG_PILOT_FILER VLEI_VERIFIER KERIA KERIA_BOOT VLEI_SERVER

# Print environment variable values
echo "TEST_ENVIRONMENT=$TEST_ENVIRONMENT"
echo "REG_PILOT_API=$REG_PILOT_API"
echo "REG_PILOT_FILER=$REG_PILOT_FILER"
echo "VLEI_VERIFIER=$VLEI_VERIFIER"
echo "KERIA=$KERIA"
echo "KERIA_BOOT=$KERIA_BOOT"
echo "VLEI_SERVER=$VLEI_SERVER"

# Check if the only argument is --all
if [[ $# -eq 1 && $1 == "--all" ]]; then
    set -- --docker=verify --build --data-report-verify-proxy
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --docker=*)
            docker_action="${1#*=}"
            case $docker_action in
                deps | verify)
                    docker compose down -v
                    docker compose up $docker_action -d --pull always
                    ;;
                *)
                    echo "Unknown docker action: $docker_action"
                    ;;
            esac
            shift # past argument
            ;;
        --build)
            npm i
            npm run build
            shift # past argument
            ;;
        --reports-download)
            npx jest ./run-bank-reports-download.test.ts --runInBand --forceExit
            download_exit_code=$?  
                if [[ $download_exit_code -ne 0 ]]; then
                exit 1  
                fi
            shift # past argument
            ;;
        --reports-cleanup)
            npx jest ./run-bank-reports-cleanup.test.ts --runInBand --forceExit
            cleanup_exit_code=$?  
                if [[ $cleanup_exit_code -ne 0 ]]; then
                exit 1  
                fi
            shift # past argument
            ;;
        --data-report)
            npx jest ./run-workflow-bank-issuance.test.ts --runInBand --detectOpenHandles --forceExit
            report_exit_code=$?  
                if [[ $report_exit_code -ne 0 ]]; then
                exit 1  
                fi
            shift # past argument
            ;;     
        --verify-proxy)
            npx jest ./run-workflow-bank-api.test.ts --runInBand --detectOpenHandles --forceExit
            verify_exit_code=$?  
                if [[ $verify_exit_code -ne 0 ]]; then
                exit 1  
                fi
            shift # past argument
            ;;      
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done