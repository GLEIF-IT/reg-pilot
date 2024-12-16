 #!/bin/bash

DOCKER_COMPOSE_FILE="docker-compose-banktest.yaml"
MODE=""
BANK_COUNT=0
REG_PILOT_API=""
START="0"
FAST_MODE=false

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
    echo "  --fast          To skip setup steps (requires bank reports, api test dockerfiles, and its build ready)."
    echo ""
    echo "Examples:"
    echo "  $0 --mode local --bank-count 5"
    echo "  $0 --mode remote --bank-count 10 --api-url https://reg-api-test.rootsid.cloud"
    echo "  $0 --mode local --bank-count 5 --fast"
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
            --start)
                START=$(( $2 - 1 ))
                shift
                ;;
            --fast)
                FAST_MODE=true
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

    if [[ "$MODE" == "remote" && -z "$REG_PILOT_API" ]]; then
        echo "ERROR: --api-url is required in remote mode."
        usage
    fi

    if [[ "$MODE" == "remote" && ! "$REG_PILOT_API" =~ ^https?:// ]]; then
        echo "ERROR: Please enter a valid --api-url"
        usage
    fi

    if [[ "$FAST_MODE" == true ]]; then
        echo "FAST MODE: Skipping report downloads, Dockerfile generation, and image build. Ensure they're already completed."
        read -p "Proceed with FAST MODE? (y/n): " confirm
        if [[ "$confirm" != "y" ]]; then
            echo "Exiting. Rerun without --fast if prerequisites are missing."
            exit 1
        fi
    fi    
}

check_available_banks() {
    local TOTAL_AVAILABLE_BANKS=600

    if (( BANK_COUNT + START > TOTAL_AVAILABLE_BANKS )); then
        echo "WARNING: You have selected more banks ($BANK_COUNT) + ($START) than available ($TOTAL_AVAILABLE_BANKS)."
        exit 1
    fi

    set -x
    for ((i=(START+1); i<=(START+BANK_COUNT); i++)); do
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

remove_api_test_containers() {
    containers=$(docker ps -aq --filter "name=_api_test")
    
    if [[ -n "$containers" ]]; then
        echo "Found existing containers, removing..."
        docker rm -f $containers > /dev/null 2>&1 
        check_status "Removing existing containers"
    else
        echo "No existing API test containers found."
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
    echo "-----------------------------------------------------"
    echo "Downloading reports for all banks..."
    echo "-----------------------------------------------------"
    for ((i=(1+START); i<=(BANK_COUNT+START); i++)); do
        export BANK_NAME="Bank_$i"
        echo "Downloading reports for $BANK_NAME..."
        ./test-workflow-banks.sh --reports-download
        check_status "Downloading report for $BANK_NAME"
    done
}

cleanup_reports() {
    echo "-----------------------------------------------------"
    echo "Cleaning up report files for all banks..."
    echo "-----------------------------------------------------"
    for ((i=(1+START); i<=(BANK_COUNT+START); i++)); do
        export BANK_NAME="Bank_$i"
        echo "Cleaning up reports for $BANK_NAME..."
        ./test-workflow-banks.sh --reports-cleanup
        check_status "Cleaning up report for $BANK_NAME"
    done
}

generate_dockerfiles() {
    echo "------------------------------------------------------------"
    echo "Generating Dockerfiles for running API test for all banks..."
    echo "------------------------------------------------------------"
    export BANK_COUNT=$BANK_COUNT
    export BANK_START=$START
    npx jest ./run-generate-bank-dockerfiles.test.ts --runInBand --forceExit
    check_status "Generating Dockerfiles for $START to ${BANK_COUNT+START} bank(s)"
}

build_api_docker_image() {
    BANK_NAME=$(echo "$BANK_NAME" | tr '[:upper:]' '[:lower:]')
    BANK_DOCKERFILE="../images/${BANK_NAME}.dockerfile"
    BANK_IMAGE_TAG="${BANK_NAME}_api_test"

    # Check if the Dockerfile exists
    if [[ ! -f "$BANK_DOCKERFILE" ]]; then
        echo "ERROR: Dockerfile for $BANK_NAME not found at $BANK_DOCKERFILE"
        exit 1
    fi

    echo "Building Docker image for $BANK_NAME..."
    LOG_FILE="./bank_test_logs/docker_build_logs/$BANK_NAME-build-$(date +"%Y%m%d_%H%M%S").log"
    mkdir -p $(dirname "$LOG_FILE") 
    docker build --platform linux/arm64 -f $BANK_DOCKERFILE -t $BANK_IMAGE_TAG ../ > "$LOG_FILE" 2>&1

    BUILD_STATUS=$?
    if [[ $BUILD_STATUS -ne 0 ]]; then
        echo "Error: Building Docker image for $BANK_NAME failed. See $LOG_FILE for details."
        exit 1
    fi

    echo "Docker image for $BANK_NAME built successfully."
    }

run_api_test() {
    BANK_NAME=$(echo "$1" | tr '[:upper:]' '[:lower:]') 
    BANK_IMAGE_TAG="${BANK_NAME}_api_test"

    LOG_FILE="./bank_test_logs/api_test_logs/$BANK_NAME-api-test-$(date +"%Y%m%d_%H%M%S").log"
    mkdir -p $(dirname "$LOG_FILE")

    echo "Running API test for $BANK_NAME..."
    docker run --name $BANK_IMAGE_TAG $BANK_IMAGE_TAG > "$LOG_FILE" 2>&1

    API_TEST_STATUS=$?
    if [[ $API_TEST_STATUS -ne 0 ]]; then
        echo "API test for $BANK_NAME failed."
        exit 1
    fi
    echo "API test for $BANK_NAME completed successfully."

    docker rm "$BANK_IMAGE_TAG" > /dev/null 2>&1
    check_status "Removing container for $BANK_NAME"
}

load_test_banks() {
    SUCCESS_COUNT=0
    FAILURE_COUNT=0

    if [[ "$FAST_MODE" == false ]]; then
    # Building docker images for all banks
    PIDS=() 
    echo "---------------------------------------------------"
    echo "Building docker image to run API test for all banks"
    echo "---------------------------------------------------"
    for ((i = (1+START); i <= (BANK_COUNT+START); i++)); do
        BANK_NAME="Bank_$i"
        build_api_docker_image $BANK_NAME &
        PIDS+=($!)  
    done
    wait "${PIDS[@]}"  # Wait for all Docker image builds to finish
    fi

    #Running API tests for all banks
    START_TIME=$(date +%s)
    PIDS=() 
    echo "---------------------------------------------------"
    echo "Running API test for all banks"
    echo "---------------------------------------------------"
    for ((i = (1+START); i <= (BANK_COUNT+START); i++)); do
        BANK_NAME="Bank_$i"
        run_api_test $BANK_NAME &
        PIDS+=($!) 
    done

        for pid in "${PIDS[@]}"; do
        wait $pid
        API_TEST_STATUS=$?

        if [[ $API_TEST_STATUS -eq 0 ]]; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
        fi
    done

    END_TIME=$(date +%s)
    ELAPSED_TIME=$((END_TIME - START_TIME))

    if [[ "$MODE" == "local" && "$FAILURE_COUNT" -eq 0 ]]; then
        stop_services_local
    fi

    echo "========================================================="
    echo "                   TEST SUMMARY                          "
    echo "========================================================="
    echo "TOTAL BANKS TESTED: $BANK_COUNT"
    echo "SUCCESS COUNT: $SUCCESS_COUNT"
    echo "FAILURE COUNT: $FAILURE_COUNT"
    echo "TOTAL RUNTIME: $((ELAPSED_TIME / 3600))h:$((ELAPSED_TIME % 3600 / 60))m:$((ELAPSED_TIME % 60))s"
    echo "=========================================================="
}


main() {
    parse_args "$@"
    check_available_banks

    remove_api_test_containers

    if [[ "$MODE" == "local" ]]; then
        start_services_local
    fi

    if [[ "$FAST_MODE" == false ]]; then
        download_reports
        generate_dockerfiles
    fi

    load_test_banks
}

main "$@"