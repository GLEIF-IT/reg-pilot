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
    : "${WITNESS_URLS:=http://witness-demo:5642,http://witness-demo:5643,http://witness-demo:5644}"
    : "${WITNESS_IDS:=$WAN,$WIL,$WES}"
    : "${VLEI_SERVER:=http://vlei-server:7723}"
    : "${WORKFLOW:=singlesig-single-user.yaml}"
    : "${CONFIGURATION:=configuration-singlesig-single-user.json}"
fi

# Export environment variables
export WORKFLOW CONFIGURATION TEST_ENVIRONMENT REG_PILOT_API VLEI_VERIFIER KERIA KERIA_BOOT WITNESS_URLS WITNESS_IDS VLEI_SERVER

# Print environment variable values
echo "WORKFLOW=$WORKFLOW"
echo "CONFIGURATION=$CONFIGURATION"
echo "TEST_ENVIRONMENT=$TEST_ENVIRONMENT"
echo "REG_PILOT_API=$REG_PILOT_API"
echo "VLEI_VERIFIER=$VLEI_VERIFIER"
echo "KERIA=$KERIA"
echo "KERIA_BOOT=$KERIA_BOOT"
echo "WITNESS_URLS=$WITNESS_URLS"
echo "WITNESS_IDS=$WITNESS_IDS"
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
            npm run build
            shift # past argument
            ;;
        --data-report-verify-proxy)
            npm run ./run-workflow.ts --runInBand --detectOpenHandles --forceExit
            shift # past argument
            ;;        
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done