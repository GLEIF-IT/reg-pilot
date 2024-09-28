#!/bin/bash

printHelp() {
    echo "Usage: test.sh [options]"
    echo "Options:"
    echo "  --all"
    echo "      Runs --build, --docker=verify, --data, --report, and --verify"
    echo "  --docker=deps|verify|proxy-verify"
    echo "      deps: Setup only keria, witnesses, vlei-server services in local docker containers"
    echo "      verify: Setup all services (keria, witnesses, vlei-server, reg-pilot-api, and vlei-verifier) in local docker containers"
    echo "      verify-proxy: Setup all services and a proxy (keria, witnesses, vlei-server, reg-pilot-api, and vlei-verifier) in local docker containers"
    echo "  --build"
    echo "      build the typescript tests"
    echo "  --data"
    echo "      run the test data generation to populate keria identifiers/credentials"
    echo "  --report"
    echo "      create signed/failure reports from original reports, see the 'signed' directory for the generated signed reports that can be uploaded"
    echo "  --verify"
    echo "      run the reg-pilot-api and vlei-verifier integration tests using the keria instance to login and upload signed/failure reports"
    echo "  --proxy"
    echo "      add a proxy service between the tests and the reg-pilot-api to test forwarded communications"
    echo "  --help"
    echo "      print this help"
    exit 0
}

# Extracted values from resolve-env.ts
WAN='BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha'
WIL='BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM'
WES='BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX'

# Check if TEST_ENVIRONMENT is set
if [ -z "$TEST_ENVIRONMENT" ]; then
    echo "TEST_ENVIRONMENT is not set, setting default values"
    # Default values for 'docker' environment
    : "${TEST_ENVIRONMENT:=docker}"
    : "${ROLE_NAME:=EBADataSubmitter}"
    : "${REG_PILOT_API:=http://127.0.0.1:8000}"
    : "${REG_PILOT_PROXY:=http://127.0.0.1:3434}"
    : "${VLEI_VERIFIER:=http://127.0.0.1:7676}"
    : "${KERIA:=http://127.0.0.1:3901}"
    : "${KERIA_BOOT:=http://127.0.0.1:3903}"
    : "${WITNESS_URLS:=http://witness-demo:5642,http://witness-demo:5643,http://witness-demo:5644}"
    : "${WITNESS_IDS:=$WAN,$WIL,$WES}"
    : "${VLEI_SERVER:=http://vlei-server:7723}"
    : "${SECRETS_JSON_CONFIG:=singlesig-single-aid}"
fi

# Export environment variables
export TEST_ENVIRONMENT ROLE_NAME REG_PILOT_API REG_PILOT_PROXY VLEI_VERIFIER KERIA KERIA_BOOT WITNESS_URLS WITNESS_IDS VLEI_SERVER SECRETS_JSON_CONFIG

# Print environment variable values
echo "TEST_ENVIRONMENT=$TEST_ENVIRONMENT"
echo "ROLE_NAME=$ROLE_NAME"
echo "REG_PILOT_API=$REG_PILOT_API"
echo "REG_PILOT_PROXY=$REG_PILOT_PROXY"
echo "VLEI_VERIFIER=$VLEI_VERIFIER"
echo "KERIA=$KERIA"
echo "KERIA_BOOT=$KERIA_BOOT"
echo "WITNESS_URLS=$WITNESS_URLS"
echo "WITNESS_IDS=$WITNESS_IDS"
echo "VLEI_SERVER=$VLEI_SERVER"

# Check if the only argument is --all
if [[ $# -eq 1 && $1 == "--all" ]]; then
    set -- --docker=verify --build --data --report --verify --proxy
fi

if [[ $# -eq 0 ]]; then
    printHelp
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help)
            printHelp
            ;;
        --docker=*)
            docker_action="${1#*=}"
            case $docker_action in
                deps | verify | proxy-verify)
                    docker compose down -v
                    docker compose up "$docker_action" -d --pull always
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
        --data)            
            export SECRETS_JSON_CONFIG="${SECRETS_JSON_CONFIG}"
            npx jest ./vlei-issuance.test.ts
            shift # past argument
            ;;
        --report)
            export SECRETS_JSON_CONFIG="${SECRETS_JSON_CONFIG}"
            npx jest ./report.test.ts
            shift # past argument
            ;;
        --verify)
            export SECRETS_JSON_CONFIG="${SECRETS_JSON_CONFIG}"
            npx jest ./reg-pilot-api.test.ts
            shift # past argument
            ;;
        --proxy)
            export SECRETS_JSON_CONFIG="${SECRETS_JSON_CONFIG}"            
            export REG_PILOT_API="${REG_PILOT_PROXY}"
            echo "Now setting api to proxy url REG_PILOT_API=$REG_PILOT_API"
            npx jest ./vlei-verification.test.ts
            shift # past argument
            ;;
        *)
            echo "Unknown argument: $1"
            shift # past argument
            ;;
    esac
done