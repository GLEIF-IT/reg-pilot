#!/bin/bash

DOCKER_COMPOSE_FILE="docker-compose-banktest.yaml"
MODE=""
BANK_COUNT=0
FIRST_BANK=1
BATCH_SIZE=5
REG_PILOT_API=""
FAST_MODE=false
STAGE_MODE=false
EBA=""

usage() {
    echo "---------------------------------------------------------------------------------------"
    echo "usage: $0 --mode [local|remote] --bank-count [COUNT] [--first-bank FIRST] [--batch-size SIZE] [--api-url URL] [--eba] [--stage] | [--fast]"
    echo ""
    echo "Options:"
    echo "  --mode          Specify the test mode:"
    echo "                  - 'local': Docker-based testing."
    echo "                  - 'remote': Remote-services-based testing."
    echo ""
    echo "  --first-bank    The bank number to start testing from (default: 1)."
    echo "                  - Specify the starting bank number (e.g., 5 for Bank_5)."
    echo ""
    echo "  --bank-count    Number of banks to test:"
    echo "                  - Specify the count (e.g., 1 for Bank_1, 10 for Bank_1 to Bank_10)."
    echo "                  - If specifying first-bank, then specify the count (e.g., 5 for Bank_5 to Bank_9)."
    echo ""
    echo "  --batch-size    Number of banks to process per batch. (default: 5)"
    echo ""
    echo "  --api-url       (Required for 'remote' mode)"
    echo "                  API URL of the reg-pilot-api service (e.g., https://api.example.com)."
    echo ""
    echo "  --eba           Enable EBA mode for API tests. --api-url ignored"
    echo ""
    echo "  --stage         Perform all setup tasks (generate bank reports, generate and build api test dockerfiles)."
    echo ""
    echo "  --fast          Skip setup steps (requires bank reports and Dockerfiles to already be staged and ready)."
    echo ""
    echo "EXAMPLES:"
    echo ""
    echo "  $0 --mode local --bank-count 5 --stage | --fast"
    echo "  $0 --mode remote --bank-count 10 --api-url https://reg-api-test.rootsid.cloud --stage | --fast"
    echo "  $0 --mode local --first-bank 121 --bank-count 120 --stage | --fast"
    echo "  $0 --mode remote --first-bank 121 --bank-count 120 --api-url https://reg-api-test.rootsid.cloud --stage | --fast"
    echo ""
    echo "---------------------------------------------------------------------------------------"
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
            --eba)
                EBA="true"
                shift
                ;;
            --first-bank)
                FIRST_BANK="$2"
                shift
                ;;
            --bank-count)
                BANK_COUNT="$2"
                shift
                ;;
            --batch-size)
                BATCH_SIZE="$2"
                shift
                ;;
            --api-url)
                REG_PILOT_API="$2"
                shift
                ;;
            --fast)
                FAST_MODE=true
                ;;
            --stage)
                STAGE_MODE=true
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
    if [[ -z "$MODE" || -z "$BANK_COUNT" || "$BANK_COUNT" -eq 0 ]]; then
        echo "ERROR: --mode and --bank-count are required."
        usage
    fi

    if ! [[ "$BANK_COUNT" =~ ^[0-9]+$ ]]; then
        echo "ERROR: --bank-count must be a valid number."
        usage
    fi

    if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [[ "$BATCH_SIZE" -lt 1 ]]; then
        echo "ERROR: --batch-size must be a valid number."
        usage
    fi

    if [[ "$MODE" != "local" && "$MODE" != "remote" ]]; then
        echo "ERROR: Please enter valid mode"
        usage
    fi

    if [[ "$FAST_MODE" == false && "$STAGE_MODE" == false ]]; then
        echo "ERROR: Either --stage or --fast must be specified."
        usage
    fi

    if [[ "$MODE" == "local" && "$EBA" ]]; then
        echo "ERROR: --eba should be used with remote mode."
        usage
    fi

    if [[ "$MODE" == "remote" && (-z "$REG_PILOT_API" && -z "$EBA") ]]; then
        echo "ERROR: --api-url or --eba is required in remote mode."
        usage
    fi

    if [[ "$MODE" == "remote" && (! "$REG_PILOT_API" =~ ^https?:// && -z "$EBA")]]; then
        echo "ERROR: Please enter a valid --api-url or specify --eba."
        usage
    fi

    if [[ "$FAST_MODE" == true ]]; then
        echo "FAST MODE: Ensure that all reports and Dockerfiles are staged and ready to run API tests."
        read -p "Proceed with FAST MODE? (y/n): " confirm
        if [[ "$confirm" = "y" ]]; then

            echo "Validating if API test Docker image exists locally..."
            LAST_BANK=$((FIRST_BANK + BANK_COUNT - 1))
            for ((i = FIRST_BANK; i <= LAST_BANK; i++)); do
                BANK_NAME="Bank_${i}"
                BANK_IMAGE_TAG="$(echo "$BANK_NAME" | tr '[:upper:]' '[:lower:]')_api_test:latest"

                if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${BANK_IMAGE_TAG}$"; then
                    echo "Exiting due to missing Docker images. Rerun the staging process again to create missing images."
                    exit 1
                fi
            done
            echo "All Docker images validated successfully."
        else
            echo "Exiting. Rerun with --stage if prerequisites are missing."
            exit 1
        fi
    fi    
}

check_available_banks() {
    local TOTAL_AVAILABLE_BANKS=601

    if (( BANK_COUNT + FIRST_BANK - 1 > TOTAL_AVAILABLE_BANKS )); then
        echo "WARNING: You have selected more banks ($((BANK_COUNT + FIRST_BANK - 1))) than available ($TOTAL_AVAILABLE_BANKS)."
        exit 1
    fi
}    

start_keria() {
    echo "---------------------------------------------------"
    echo "Starting KERIA instances..."
    echo "---------------------------------------------------"

    set -x
    LAST_BANK=$((FIRST_BANK + BANK_COUNT - 1))
    for ((i = FIRST_BANK; i <= LAST_BANK; i++)); do
        local PORT_OFFSET=$((10*(i-1)))
        local ADMIN_PORT=$((20001 + PORT_OFFSET))
        local HTTP_PORT=$((20002 + PORT_OFFSET))
        local BOOT_PORT=$((20003 + PORT_OFFSET))
        local CONTAINER_NAME="bank${i}"
        local KERIA_CONFIG="{
            \"dt\": \"2023-12-01T10:05:25.062609+00:00\",
            \"keria\": {
                \"dt\": \"2023-12-01T10:05:25.062609+00:00\",
                \"curls\": [\"http://host.docker.internal:$HTTP_PORT/\"]
            },
            \"iurls\": []
        }"

        # Check if the container is already running
        if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
            echo "Container ${CONTAINER_NAME} is already running. Skipping..."
            continue
        fi

        # -v ./config/testkeria.json:/keria/config/keri/cf/keria.json \
        docker run --rm -d -p $ADMIN_PORT:3901 -p $HTTP_PORT:3902 -p $BOOT_PORT:3903 \
        --name $CONTAINER_NAME \
        -e KERI_AGENT_CORS=1 \
        -e PYTHONUNBUFFERED=1 \
        -e PYTHONIOENCODING=UTF-8 \
        ronakseth96/keria:TestBank_$i \
        --config-dir /keria/config --config-file keria.json --loglevel DEBUG

        # Write the JSON string to a file in the Docker container
        docker exec $CONTAINER_NAME sh -c 'mkdir -p /keria/config/keri/cf'
        echo "$KERIA_CONFIG" | docker exec -i $CONTAINER_NAME sh -c 'cat > /keria/config/keri/cf/keria.json'
    done
    set +x
}

stop_keria() {
    echo "---------------------------------------------------"
    echo "Stopping all KERIA containers..."
    echo "---------------------------------------------------"
    docker stop $(docker ps -q --filter "name=bank") > /dev/null 2>&1
    check_status "Stopping KERIA containers"
}

remove_keria_containers() {
    containers=$(docker ps -aq --filter "name=bank")
    
    if [[ -n "$containers" ]]; then
        echo "---------------------------------------------------"
        echo "Found existing KERIA containers, removing..."
        echo "---------------------------------------------------"
        docker rm -f $containers > /dev/null 2>&1 
        check_status "Removing existing containers"
    else
        echo "---------------------------------------------------"
        echo "No existing KERIA containers found."
        echo "---------------------------------------------------"
    fi
}

remove_api_test_containers() {
    containers=$(docker ps -aq --filter "name=_api_test")
    
    if [[ -n "$containers" ]]; then
        echo "---------------------------------------------------"
        echo "Found existing api test containers, removing..."
        echo "---------------------------------------------------"
        docker rm -f $containers > /dev/null 2>&1 
        check_status "Removing existing api test containers"
    else
        echo "---------------------------------------------------"
        echo "No existing API test containers found."
        echo "---------------------------------------------------"
    fi
}

start_services_local() {
    echo "---------------------------------------------------"
    echo "Starting local services..."
    echo "---------------------------------------------------"
    docker compose -f $DOCKER_COMPOSE_FILE up -d verify
    check_status "Starting local services"
}

stop_services_local() {
    echo "---------------------------------------------------"
    echo "Stopping all local services..."
    echo "---------------------------------------------------"
    docker compose -f $DOCKER_COMPOSE_FILE down -v
    check_status "Stopping local services"
}

download_reports() {
        export BANK_NAME="Bank_$i"
        echo "---------------------------------------------------"
        echo "Downloading reports for $BANK_NAME..."
        echo "---------------------------------------------------"
        ./test-workflow-banks.sh --reports-download
        check_status "Downloading report for $BANK_NAME"
}

cleanup_reports() {
        export BANK_NAME="Bank_$i"
        echo "---------------------------------------------------"
        echo "Cleaning up report files for $BANK_NAME..."
        echo "---------------------------------------------------"
        ./test-workflow-banks.sh --reports-cleanup
        check_status "Cleaning up report for $BANK_NAME"
}

generate_dockerfiles() {
    echo "------------------------------------------------------------"
    echo "Generating Dockerfiles for running API test for all banks..."
    echo "------------------------------------------------------------"
    export BANK_COUNT=$BANK_COUNT
    export FIRST_BANK=$FIRST_BANK
    export EBA=$EBA
    export REG_PILOT_API=$REG_PILOT_API
    npx jest ./run-generate-bank-dockerfiles.test.ts --runInBand --forceExit
    check_status "Generating Dockerfiles for $FIRST_BANK to $((BANK_COUNT + FIRST_BANK)) bank(s), is EBA: $EBA"
}

build_api_docker_image() {
    BANK_NAME=$(echo "$BANK_NAME" | tr '[:upper:]' '[:lower:]')
    BANK_DOCKERFILE="../images/${BANK_NAME}.dockerfile"
    BANK_IMAGE_TAG="${BANK_NAME}_api_test:latest"

    # Check if the Dockerfile exists
    if [[ ! -f "$BANK_DOCKERFILE" ]]; then
        echo "ERROR: Dockerfile for $BANK_NAME not found at $BANK_DOCKERFILE"
        exit 1
    fi

    echo "---------------------------------------------------"
    echo "Building Docker image for $BANK_NAME..."
    echo "---------------------------------------------------"
    LOG_FILE="./bank_test_logs/docker_build_logs/$BANK_NAME-build.log"
    mkdir -p $(dirname "$LOG_FILE") 
    docker build --platform linux/arm64 -f $BANK_DOCKERFILE -t $BANK_IMAGE_TAG ../ > "$LOG_FILE" 2>&1

    BUILD_STATUS=$?
    if [[ $BUILD_STATUS -ne 0 ]]; then
        echo "Error: Building Docker image for $BANK_NAME failed. See $LOG_FILE for details."
        tail -n 25 "$LOG_FILE"
        exit 1
    fi

    echo "Docker image for $BANK_NAME built successfully."
    }

run_api_test() {
    BANK_NAME=$(echo "$1" | tr '[:upper:]' '[:lower:]') 
    BANK_IMAGE_TAG="${BANK_NAME}_api_test"

    LOG_FILE="./bank_test_logs/api_test_logs/$BANK_NAME-api-test.log"
    mkdir -p $(dirname "$LOG_FILE")

    docker rm -f "$BANK_IMAGE_TAG" > /dev/null 2>&1

    echo "Running API test for $BANK_NAME..."
    docker run --name $BANK_IMAGE_TAG $BANK_IMAGE_TAG > "$LOG_FILE" 2>&1

    API_TEST_STATUS=$?
    if [[ $API_TEST_STATUS -ne 0 ]]; then
        echo "API test for $BANK_NAME failed. See $LOG_FILE for details."
        tail -n 25 "$LOG_FILE"
        return 1
    else
        echo "API test for $BANK_NAME completed successfully."
    fi    

    docker rm "$BANK_IMAGE_TAG" > /dev/null 2>&1
    check_status "Removing container for $BANK_NAME"
}

load_test_banks() {
    SUCCESS_COUNT=0
    FAILURE_COUNT=0
    RETRY_COUNT=0
    MAX_RETRIES=3

    LAST_BANK=$((FIRST_BANK + BANK_COUNT - 1))

    if [[ "$STAGE_MODE" == true ]]; then
    # Building docker images for all banks
    START_TIME=$(date +%s)
    for ((i = FIRST_BANK; i <= LAST_BANK; i++)); do
        BANK_NAME="Bank_$i"
        download_reports $BANK_NAME
        build_api_docker_image $BANK_NAME
        cleanup_reports $BANK_NAME
    done

    END_TIME=$(date +%s)
    ELAPSED_TIME=$((END_TIME - START_TIME))
    echo "========================================================="
    echo "                   STAGING SUMMARY                       "
    echo "========================================================="
    echo "TOTAL BANKS STAGED: $BANK_COUNT"
    echo "TOTAL RUNTIME: $((ELAPSED_TIME / 3600))h:$((ELAPSED_TIME % 3600 / 60))m:$((ELAPSED_TIME % 60))s"
    echo "=========================================================="
    fi

    if [[ "$FAST_MODE" == true ]]; then
    remove_keria_containers
    remove_api_test_containers

    # Starting KERIA containers for all banks
    start_keria

    #Running API tests for all banks
    echo "---------------------------------------------------"
    echo "Running API test for all banks"
    echo "---------------------------------------------------"

    START_TIME=$(date +%s)
    FAILED_BANKS=()

    for ((BATCH_START = FIRST_BANK; BATCH_START <= LAST_BANK; BATCH_START += BATCH_SIZE)); do
            BATCH_END=$((BATCH_START + BATCH_SIZE - 1))
            if [[ $BATCH_END -gt $LAST_BANK ]]; then
                BATCH_END=$LAST_BANK
            fi

    echo "---------------------------------------------------"
    echo "Processing banks $BATCH_START to $BATCH_END..."
    echo "---------------------------------------------------"
    # Running API tests for all banks in the current batch
    PIDS=()
    BANK_NAMES=()

        for ((i = BATCH_START; i <= BATCH_END; i++)); do
            BANK_NAME="Bank_$i"
            BANK_NAMES+=("$BANK_NAME")
            run_api_test $BANK_NAME &
            PIDS+=($!)  
        done

        # Wait for all tests in the batch to finish
        for pid in "${!PIDS[@]}"; do
            wait "${PIDS[$pid]}"
            API_TEST_STATUS=$?
            if [[ $API_TEST_STATUS -eq 0 ]]; then
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            else
                FAILURE_COUNT=$((FAILURE_COUNT + 1))
                FAILED_BANKS+=("${BANK_NAMES[$pid]}")
            fi
        done
    done   
  
    # List of failed banks after processing all batches
    if [[ ${#FAILED_BANKS[@]} -gt 0 ]]; then
        echo "-----------------------------------------------------------------------------------------------------------"
        echo "Failed Bank(s): ${FAILED_BANKS[@]}"
        echo "-----------------------------------------------------------------------------------------------------------"
    fi

    while [[ ${#FAILED_BANKS[@]} -gt 0 && $RETRY_COUNT -lt $MAX_RETRIES ]]; do
        echo "Retrying failed banks (Attempt $((RETRY_COUNT + 1))/${MAX_RETRIES})..."
        RETRY_COUNT=$((RETRY_COUNT + 1))
        FAILED_BANKS=($(printf "%s\n" "${FAILED_BANKS[@]}" | sort -u))
        NEW_FAILED_BANKS=()

        # Process failed banks in batches
        for ((BATCH_START = 0; BATCH_START < ${#FAILED_BANKS[@]}; BATCH_START += BATCH_SIZE)); do
            BATCH_END=$((BATCH_START + BATCH_SIZE - 1))
            if [[ $BATCH_END -ge ${#FAILED_BANKS[@]} ]]; then
                BATCH_END=$((${#FAILED_BANKS[@]} - 1))
            fi

            echo "-----------------------------------------------------------------------------------------------------------"
            echo "Retrying processing banks ${FAILED_BANKS[@]:BATCH_START:BATCH_END - BATCH_START + 1}..."
            echo "-----------------------------------------------------------------------------------------------------------"

            # Retries for failed banks in the current batch
            PIDS=()
            for ((i = BATCH_START; i <= BATCH_END; i++)); do
                BANK_NAME="${FAILED_BANKS[$i]}"
                run_api_test "$BANK_NAME" &
                PIDS+=($!)
            done

            # Wait for all retry processes in the current batch to finish
            for pid in "${!PIDS[@]}"; do
                wait "${PIDS[$pid]}"
                API_TEST_STATUS=$?
                if [[ $API_TEST_STATUS -eq 0 ]]; then
                    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
                else
                    FAILURE_COUNT=$((FAILURE_COUNT + 1))
                    NEW_FAILED_BANKS+=("${FAILED_BANKS[$BATCH_START + pid]}")
                fi
            done
        done

        FAILED_BANKS=("${NEW_FAILED_BANKS[@]}")
    done

    if [[ ${#FAILED_BANKS[@]} -gt 0 ]]; then
    echo "-----------------------------------------------------------------------------------------------------------"
    echo "Failed Bank(s) after all retry attempts: ${FAILED_BANKS[@]}"
    echo "-----------------------------------------------------------------------------------------------------------"
    fi
    
    FAILURE_COUNT=${#FAILED_BANKS[@]}

    END_TIME=$(date +%s)
    ELAPSED_TIME=$((END_TIME - START_TIME))

    if [[ "$FAILURE_COUNT" -eq 0 ]]; then
    stop_keria
    
        if [[ "$MODE" == "local" ]]; then
            stop_services_local
        fi
    fi

    echo "========================================================="
    echo "                   TEST SUMMARY                          "
    echo "========================================================="
    echo "TOTAL BANKS TESTED: $BANK_COUNT"
    echo "SUCCESS COUNT: $SUCCESS_COUNT"
    echo "FAILURE COUNT: $FAILURE_COUNT"
    echo "TOTAL RUNTIME: $((ELAPSED_TIME / 3600))h:$((ELAPSED_TIME % 3600 / 60))m:$((ELAPSED_TIME % 60))s"
    echo "=========================================================="
    fi
}

main() {
    parse_args "$@"
    check_available_banks

    if [[ "$FAST_MODE" == true && "$MODE" == "local" ]]; then
        start_services_local
    fi

    if [[ "$STAGE_MODE" == true ]]; then
        generate_dockerfiles
    fi

    load_test_banks
}

main "$@"