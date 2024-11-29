#!/bin/bash

KERIA_IMAGE_REPO="ronakseth96/keria"
WORKFLOW_FILE="./test/run-workflow-bank-api.test.ts"
DOCKER_COMPOSE_FILE="docker-compose-banktest.yaml"

get_bank_count() {
    read -p "Enter the number of banks for load testing (e.g., 1 for Bank_1 or 10 for Bank_1 to Bank_10): " BANK_COUNT

    if [[ "$BANK_COUNT" =~ ^[0-9]+$ ]]; then
        echo "Running load test for $BANK_COUNT bank(s)..."
    else
        echo "Invalid input. Please enter a valid number."
        exit 1
    fi
}


# Start the KERIA service
start_keria() {
    echo "Bringing up KERIA service for $BANK_NAME with image $BANK_KERIA_IMAGE..."

    docker-compose -f $DOCKER_COMPOSE_FILE up verify -d
    check_status "Starting KERIA for $BANK_NAME"
}

# Stop the KERIA service
stop_keria() {
    echo "Stopping KERIA container for $BANK_NAME..."
    docker-compose -f $DOCKER_COMPOSE_FILE down
    check_status "Stopping KERIA for $BANK_NAME"
}

# Function to run the bank test workflow
run_bank_test_workflow() {
    echo "Running test workflow for $BANK_NAME..."
    TEST_ENVIRONMENT="bank_test" ./test-workflow-banks.sh --verify-proxy
    check_status "Test workflow for $BANK_NAME"
}

check_status() {    
    local message="$1"
    if [[ $? -ne 0 ]]; then
        echo "Error: $message failed. Exiting."
        exit 1
    fi
}

load_test_banks() {
    SUCCESS_COUNT=0
    FAILURE_COUNT=0
    for ((i = 1; i <= BANK_COUNT; i++)); do
        BANK_NAME="Bank_$i"
        export BANK_NAME
        BANK_KERIA_IMAGE="$KERIA_IMAGE_REPO:Test$BANK_NAME"
        export BANK_KERIA_IMAGE 

        echo "=== Starting Test for $BANK_NAME ==="

        start_keria 

        run_bank_test_workflow
        if [[ $? -eq 0 ]]; then
            echo "Test successful for $BANK_NAME."
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "Test failed for $BANK_NAME."
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
        fi

        stop_keria

        echo "=== Completed Test for $BANK_NAME ==="
    done

    echo "=== TEST SUMMARY ==="
    echo "TOTAL BANKS TESTED: $BANK_COUNT"
    echo "SUCCESS COUNT: $SUCCESS_COUNT"
    echo "FAILURE COUNT: $FAILURE_COUNT"
    }

get_bank_count
load_test_banks