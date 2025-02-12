#!/bin/bash

KERIA_IMAGE_REPO="ronakseth96/keria"
DOCKER_COMPOSE_FILE="docker-compose-banktest.yaml"
MODE=""
BANK_COUNT=0
REG_PILOT_API=""

usage() {
    echo "---------------------------------------------"
    echo "Usage: $0 --mode [local|remote] --bank-count [COUNT] [--api-url URL]"
    echo ""
    echo "Options:"
    echo "  --mode          Specify the test mode:"
    echo "                  - 'local': Docker-based testing."
    echo "                  - 'remote': Remote-services-based testing."
    echo ""
    echo "  --bank-count    Number of banks to test:"
    echo "                  - Specify the count (e.g., 1 for Bank_1, 10 for Bank_1 to Bank_10)."
    echo ""
    echo "  --api-url       (Required for 'remote' mode)"
    echo "                  API URL of the reg-pilot-api service (e.g., https://api.example.com)."
    echo ""
    echo "Examples:"
    echo "  $0 --mode local --bank-count 5"
    echo "  $0 --mode remote --bank-count 10 --api-url https://reg-api-test.rootsid.cloud"
    echo "---------------------------------------------"
    exit 1
}


check_status() {
    if [[ $? -ne 0 ]]; then
        echo "Error: $1 failed. Exiting."
        exit 1
    fi
}

# Parse Arguments
parse_args() {
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --mode)
                MODE="$2"
                shift
                ;;
            --bank-count)
                BANK_COUNT="$2"
                shift
                ;;
            --api-url)
                REG_PILOT_API="$2"
                shift
                ;;
            *)
                echo "Unknown parameter: $1"
                usage
                ;;
        esac
        shift
    done

    validate_inputs
}

    validate_inputs() {
    # Check if MODE is empty or BANK_COUNT is either not set or equal to 0
    if [[ -z "$MODE" || -z "$BANK_COUNT" || "$BANK_COUNT" -eq 0 ]]; then
        echo "********************************************"
        echo "ERROR: --mode and --bank-count are required."
        echo "********************************************"
        usage
    fi

    # Ensure BANK_COUNT is a valid number
    if ! [[ "$BANK_COUNT" =~ ^[0-9]+$ ]]; then
        echo "*******************************************"
        echo "ERROR: --bank-count must be a valid number."
        echo "*******************************************"
        usage
    fi

    # REG_PILOT_API for local mode
    if [[ "$MODE" == "local" ]]; then
        echo "INFO: The default API URL for local mode is already set. No need to specify it."
    fi

    # Check for REG_PILOT_API is required in remote mode
    if [[ "$MODE" == "remote" && -z "$REG_PILOT_API" ]]; then
        echo "********************************************"
        echo "ERROR: --api-url is required in remote mode."
        echo "********************************************"
        usage
    fi

    # Ensure REG_PILOT_API has valid URL format
    if [[ "$MODE" == "remote" && ! "$REG_PILOT_API" =~ ^https?:// ]]; then
        echo "*****************************************"
        echo "ERROR: Please enter a valid --api-url"
        echo "*****************************************"
        usage
    fi
    }

check_available_banks() {
    local TOTAL_AVAILABLE_BANKS=60

    if [[ "$BANK_COUNT" -gt "$TOTAL_AVAILABLE_BANKS" ]]; then
        echo "WARNING: You have selected more banks ($BANK_COUNT) than available ($TOTAL_AVAILABLE_BANKS)."
        echo "Please reduce the --bank-count value to $TOTAL_AVAILABLE_BANKS or fewer for performing load test."
        exit 1
    fi
}    

# Start services
start_services_local() {
    echo "Starting local services..."
    docker compose -f $DOCKER_COMPOSE_FILE up -d verify
    check_status "Starting local services"
}

# Stop services
stop_services_local() {
    echo "Stopping all local services..."
    docker compose -f $DOCKER_COMPOSE_FILE down -v
    check_status "Stopping local services"
}

# Start KERIA
start_keria() {
    echo "Starting KERIA for $BANK_NAME with image $BANK_KERIA_IMAGE..."
    docker compose -f $DOCKER_COMPOSE_FILE up keria -d
    check_status "Starting KERIA for $BANK_NAME"
}

# Stop KERIA
stop_keria() {
    echo "Stopping KERIA for $BANK_NAME..."
    docker compose -f $DOCKER_COMPOSE_FILE stop keria && docker compose rm -sf keria
    check_status "Stopping KERIA for $BANK_NAME"
}

# Run Bank Test Workflow (Local or Remote)
run_bank_test_workflow() {
    echo "Downloading reports for $BANK_NAME..."
    ./test-workflow-banks.sh --build --reports-download="$BANK_NAME"
    check_status "Downloading reports for $BANK_NAME"

    if [[ "$MODE" == "local" ]]; then
        echo "Running local test workflow for $BANK_NAME..."
        TEST_ENVIRONMENT="docker" ./test-workflow-banks.sh --verify-proxy
    elif [[ "$MODE" == "remote" ]]; then
        echo "Running remote test workflow for $BANK_NAME with API URL: $REG_PILOT_API..."
        TEST_ENVIRONMENT="bank_test" REG_PILOT_API="$REG_PILOT_API" ./test-workflow-banks.sh --verify-proxy
    fi
    check_status "Test workflow for $BANK_NAME"

    echo "Cleaning up report files for $BANK_NAME..."
    ./test-workflow-banks.sh --reports-cleanup
    check_status "Cleaning up report files for $BANK_NAME"
    echo "Report files for $BANK_NAME cleaned up successfully."
}

# Load Test for Banks
load_test_banks() {
    SUCCESS_COUNT=0
    FAILURE_COUNT=0

    for ((i = 1; i <= BANK_COUNT; i++)); do
        TEST_USER_NAME="Bank_$i"
        export TEST_USER_NAME
        BANK_KERIA_IMAGE="$KERIA_IMAGE_REPO:Test$BANK_NAME"
        export BANK_KERIA_IMAGE

        echo "=== Starting Test for $BANK_NAME ==="

        start_keria
        run_bank_test_workflow
        if [[ "$?" -eq 0 ]]; then
            echo "Test successful for $BANK_NAME."
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "Test failed for $BANK_NAME."
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
        fi
        stop_keria

        echo "=== Completed Test for $BANK_NAME ==="
    done

    # Stop local services 
    if [[ "$MODE" == "local" ]]; then
        stop_services_local
    fi

    echo "================================="
    echo "           TEST SUMMARY          "
    echo "================================="
    echo "TOTAL BANKS TESTED: $BANK_COUNT"
    echo "SUCCESS COUNT: $SUCCESS_COUNT"
    echo "FAILURE COUNT: $FAILURE_COUNT"
    echo "================================="
}

main() {
    parse_args "$@"
    check_available_banks

    if [[ "$MODE" == "local" ]]; then
        start_services_local
    fi

    load_test_banks
}

main "$@"
