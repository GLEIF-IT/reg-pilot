#!/bin/bash

DOCKER_COMPOSE_FILE="docker-compose-banktest.yaml"
BANK_API_TEST_REPO="ronakseth96/bank_api_test"
MODE=""
BANK_COUNT=0
FIRST_BANK=1
BATCH_SIZE=5
REG_PILOT_API=""
REG_PILOT_FILER=""
FAST_MODE=false
STAGE_MODE=false
EBA=""
USE_DOCKER_INTERNAL=""
RETRY=3
TEST_ENVIRONMENT="${TEST_ENVIRONMENT:=docker}"
MAX_REPORT_SIZE="1" # 1MB
KERIA_START_PORT=20000

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
    echo "  --filer-url     (Can override default filer url for --eba)"
    echo "                  FILER API URL of the reg-pilot-api service (e.g., https://api.example.com)."
    echo ""
    echo "  --eba           Enable EBA mode for API tests. --api-url and --filer-url must be specified"
    echo ""
    echo "  --stage         Perform all setup tasks (generate bank reports, generate and build api test dockerfiles)."
    echo ""
    echo "  --fast          Skip setup steps (requires bank reports and Dockerfiles to already be staged and ready)."
    echo ""
    echo "  --max-report-size Maximum size of the report files (e.g., \"2\" to specify 2MB). 0 means add a single pdf"
    echo ""
    echo "  --retry         Number of times to retry failed tests."
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
                ;;
            --mac)
                USE_DOCKER_INTERNAL="true"
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
            --filer-url)
                REG_PILOT_FILER="$2"
                shift
                ;;
            --fast)
                FAST_MODE=true
                ;;
            --stage)
                STAGE_MODE=true
                ;;
            --retry)
                RETRY="$2"
                shift
                ;;
            --max-report-size)
                MAX_REPORT_SIZE=$2;
                shift
                ;;
            --keria-start-port)
                KERIA_START_PORT=$2;
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

    if [[ "$MODE" == "remote" && (-z "$REG_PILOT_API") ]]; then
        echo "ERROR: --api-url is required in remote mode."
        usage
    fi

    if [[ "$MODE" == "remote" && ! ("$REG_PILOT_API" =~ ^https?://)]]; then
        echo "ERROR: Please enter a valid --api-url"
        usage
    fi

    if [[ "$FAST_MODE" == true ]]; then

        if [[ -z "$GITHUB_ACTIONS" ]]; then
        echo "FAST MODE: Ensure that all reports and Dockerfiles are staged and ready to run API tests."
        # read -p "Proceed with FAST MODE? (y/n): " confirm
        # if [[ "$confirm" != "y" ]]; then
        #     echo "Exiting. Rerun with --stage if prerequisites are missing."
        #     exit 1
        # fi

            echo "Validating if API test Docker image exists locally..."
            for ((i = FIRST_BANK; i <= LAST_BANK; i++)); do
                BANK_NAME="Bank_${i}"
                BANK_IMAGE_TAG="$(echo "$BANK_NAME" | tr '[:upper:]' '[:lower:]')_api_test:latest"
                IMAGE_NAME="$BANK_API_TEST_REPO:$BANK_IMAGE_TAG" 
 
                # if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${BANK_IMAGE_TAG}$"; then
                if ! docker manifest inspect "$IMAGE_NAME" &> /dev/null; then
                    echo "Exiting due to missing Docker images. Rerun the staging process again to create missing images."
                    exit 1
                fi
            done
            echo "All Docker images validated successfully."

        else
            # Check for images in Docker Hub
            for ((i = FIRST_BANK; i <= LAST_BANK; i++)); do
                BANK_NAME="Bank_$i"
                BANK_IMAGE_TAG="$(echo "$BANK_NAME" | tr '[:upper:]' '[:lower:]')_api_test"
                IMAGE_NAME="$BANK_API_TEST_REPO:$BANK_IMAGE_TAG" 

                if ! docker manifest inspect "$IMAGE_NAME" &> /dev/null; then 
                    echo "Image '$IMAGE_NAME' not found in Docker Hub."
                    echo "Exiting due to missing Docker images. Rerun the staging process again to create missing images."
                    exit 1
                fi
            done
            echo "All Docker images validated successfully in Docker Hub."
        fi
    fi    
}

check_available_banks() {
    local TOTAL_AVAILABLE_BANKS=751

    if (( BANK_COUNT + FIRST_BANK - 1 > TOTAL_AVAILABLE_BANKS )); then
        echo "WARNING: You have selected more banks ($((BANK_COUNT + FIRST_BANK - 1))) than available ($TOTAL_AVAILABLE_BANKS)."
        exit 1
    fi
}    

setup_keria_ports() {
    echo "---------------------------------------------------"
    echo "Setting up KERIA ports for $BANK_NUM: $BANK_NAME"
    echo "---------------------------------------------------"
    local ADMIN_START_PORT=20001;
    local BOOT_START_PORT=20003;
    local HTTP_START_PORT=20002;
    local PORT_OFFSET=$((10*(BANK_NUM-1)))
    export KERIA_ADMIN_PORT=$((ADMIN_START_PORT + PORT_OFFSET))
    export KERIA_HTTP_PORT=$((HTTP_START_PORT + PORT_OFFSET))
    export KERIA_BOOT_PORT=$((BOOT_START_PORT + PORT_OFFSET))

    echo "KERIA admin port $KERIA_ADMIN_PORT, KERIA http port $KERIA_HTTP_PORT, KERIA boot port $KERIA_BOOT_PORT"
}

start_keria() {
    echo "---------------------------------------------------"
    echo "Starting KERIA instance for $BANK_NAME"
    echo "---------------------------------------------------"
    BANK_NAME=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    BANK_INDEX=$(echo "$BANK_NAME" | sed 's/[^0-9]*//g')
    
    local PORT_OFFSET=$((10*(BANK_INDEX-1)))
    local ADMIN_PORT=$((20001 + PORT_OFFSET))
    local HTTP_PORT=$((20002 + PORT_OFFSET))
    local BOOT_PORT=$((20003 + PORT_OFFSET))
    local CONTAINER_NAME=$BANK_NAME
    local KERIA_CONFIG="{
        \"dt\": \"2023-12-01T10:05:25.062609+00:00\",
        \"keria\": {
            \"dt\": \"2023-12-01T10:05:25.062609+00:00\",
            \"curls\": [\"http://keria:$HTTP_PORT/\"]
        },
        \"iurls\": []
    }"

    # Check if the container is already running
    if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
        echo "Container ${CONTAINER_NAME} is already running. Skipping..."
        return
    fi

    # -v ./config/testkeria.json:/keria/config/keri/cf/keria.json \
    docker run --rm -d -p $ADMIN_PORT:3901 -p $HTTP_PORT:3902 -p $BOOT_PORT:3903 \
    --name $CONTAINER_NAME \
    --network host \
    -e KERI_AGENT_CORS=1 \
    -e PYTHONUNBUFFERED=1 \
    -e PYTHONIOENCODING=UTF-8 \
    ronakseth96/keria:TestBank_$BANK_INDEX \
    --config-dir /keria/config --config-file keria.json --loglevel DEBUG

    # Write the JSON string to a file in the Docker container
    docker exec $CONTAINER_NAME sh -c 'mkdir -p /keria/config/keri/cf'
    echo "$KERIA_CONFIG" | docker exec -i $CONTAINER_NAME sh -c 'cat > /keria/config/keri/cf/keria.json'
}

stop_keria() {
    BANK_NAME=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    BANK_NAME_KERIA="${BANK_NAME}_keria"

    echo "---------------------------------------------------"
    echo "Stopping KERIA container for $BANK_NAME_KERIA..."
    echo "---------------------------------------------------"

    # local MAX_RETRIES=3
    # local ATTEMPT=1

    # while (( ATTEMPT <= MAX_RETRIES )); do
    docker stop "$BANK_NAME_KERIA" > /dev/null 2>&1 || true &
    #         break
    #     else
    #         (( ATTEMPT++ ))
    #     fi
    # done 
    # check_status "Stopping KERIA container for $BANK_NAME_KERIA"
}

remove_keria_containers() {
    containers=$(docker ps -aq --filter "name=^bank_[0-9]+$")
    
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
    echo "---------------------------------------------------"ƒ
    echo "Stopping all local services..."
    echo "---------------------------------------------------"
    docker compose -f $DOCKER_COMPOSE_FILE down -v
    check_status "Stopping local services"
}

download_reports() {
        BANK_USER="Bank_$i"
        echo "---------------------------------------------------"
        echo "Downloading reports for $BANK_USER..."
        echo "---------------------------------------------------"
        ./test-workflow-banks.sh --reports-download="$BANK_USER"
        check_status "Downloading report for $BANK_USER"
}

cleanup_reports() {
        BANK_USER="Bank_$i"
        echo "---------------------------------------------------"
        echo "Cleaning up report files for $BANK_USER..."
        echo "---------------------------------------------------"
        ./test-workflow-banks.sh --reports-cleanup
        check_status "Cleaning up report for $BANK_USER"
}

generate_dockerfiles() {
    echo "------------------------------------------------------------"
    echo "Generating Dockerfiles for $FIRST_BANK to $((BANK_COUNT + FIRST_BANK)) bank(s), is EBA?: $EBA, is USE_DOCKER_INTERNAL?: $USE_DOCKER_INTERNAL"
    echo "------------------------------------------------------------"
    export BANK_COUNT=$BANK_COUNT
    export FIRST_BANK=$FIRST_BANK
    export EBA=$EBA
    export REG_PILOT_API=$REG_PILOT_API
    export REG_PILOT_FILER=$REG_PILOT_FILER
    export USE_DOCKER_INTERNAL=$USE_DOCKER_INTERNAL
    export TEST_DOCKER="false"
    npx jest ./run-generate-bank-dockerfiles.test.ts --runInBand --forceExit --detectOpenHandles
    check_status "Generating Dockerfiles for $FIRST_BANK to $((BANK_COUNT + FIRST_BANK)) bank(s), is EBA?: $EBA, is USE_DOCKER_INTERNAL?: $USE_DOCKER_INTERNAL"
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

    echo "---------------------------------------------------"
    echo "Building Docker image for $BANK_NAME: $BANK_DOCKERFILE"
    echo "---------------------------------------------------"
    LOG_FILE="./bank_test_logs/docker_build_logs/$BANK_NAME-build.log"
    mkdir -p $(dirname "$LOG_FILE") 
    # docker build --platform linux/arm64 -f $BANK_DOCKERFILE -t $BANK_IMAGE_TAG ../ > "$LOG_FILE" 2>&1

    if [[ -z "$GITHUB_ACTIONS" ]]; then 
        # Local execution: Build image locally
        docker build --platform linux/arm64 -f $BANK_DOCKERFILE -t $BANK_API_TEST_REPO:$BANK_IMAGE_TAG ../ > "$LOG_FILE" 2>&1
        # docker buildx build --platform linux/amd64,linux/arm64 -f $BANK_DOCKERFILE -t $BANK_API_TEST_REPO:$BANK_IMAGE_TAG ../ > "$LOG_FILE" 2>&1
    else 
        # GitHub Actions: Build and push to Docker Hub
        docker buildx build --platform linux/amd64,linux/arm64 -f $BANK_DOCKERFILE -t $BANK_API_TEST_REPO:$BANK_IMAGE_TAG ../ --push  > "$LOG_FILE" 2>&1
    fi

    BUILD_STATUS=$?
    if [[ $BUILD_STATUS -ne 0 ]]; then
        if [[ -z "$GITHUB_ACTIONS" ]]; then
            echo "Error: Building Docker image for $BANK_NAME failed. See $LOG_FILE for details."
        else
            echo "Error: Building and pushing Docker image for $BANK_NAME failed. See $LOG_FILE for details."
        fi
        tail -n 25 "$LOG_FILE"
        exit 1
    fi

    if [[ -z "$GITHUB_ACTIONS" ]]; then
        echo "Docker image for $BANK_NAME built successfully."
    else
        echo "Docker image for $BANK_NAME built and pushed successfully."
    fi
}

run_api_test() {
    BANK_NAME=$(echo "$1" | tr '[:upper:]' '[:lower:]') 
    BANK_IMAGE_TAG="${BANK_NAME}_api_test"
    export USE_DOCKER_INTERNAL=$USE_DOCKER_INTERNAL

    LOG_FILE="./bank_test_logs/api_test_logs/$BANK_NAME-api-test.log"
    mkdir -p $(dirname "$LOG_FILE")

    docker rm -f "$BANK_IMAGE_TAG" > /dev/null 2>&1

    echo "Running API test for $BANK_NAME..."

    TEST_FILE="./test/run-workflow-bank.test.ts"
    if [[ "$EBA" == "true" ]]; then
        TEST_ENVIRONMENT="eba_bank_test"
        if [[ "$STAGE_MODE" == true ]]; then
            TEST_NAME="eba-verifier-prep-only"
        else
            TEST_NAME="eba-verifier-bank-test-workflow"
        fi
    else
        TEST_NAME="api-verifier-bank-test-workflow"
    fi
    START_TIME=$(date +%s)

    if [[ "$MODE" == "remote" ]]; then
            if [[ "$EBA" == "true" ]]; then
                docker run \
                    --network host \
                    -e TEST_ENVIRONMENT="$TEST_ENVIRONMENT" \
                    -e REG_PILOT_API="$REG_PILOT_API" \
                    -e REG_PILOT_FILER="$REG_PILOT_FILER" \
                    --name $BANK_IMAGE_TAG $BANK_API_TEST_REPO:$BANK_IMAGE_TAG > "$LOG_FILE" 2>&1
            else 
                docker run \
                    --network host \
                    -e REG_PILOT_API="$REG_PILOT_API" \
                    -e REG_PILOT_FILER="$REG_PILOT_FILER" \
                    --name $BANK_IMAGE_TAG $BANK_API_TEST_REPO:$BANK_IMAGE_TAG > "$LOG_FILE" 2>&1
            fi

            docker rm "$BANK_IMAGE_TAG" > /dev/null 2>&1
            check_status "Removing container for $BANK_NAME"
    else        
        # docker run --network host --name $BANK_IMAGE_TAG $BANK_API_TEST_REPO:$BANK_IMAGE_TAG > "$LOG_FILE" 2>&1
            export TEST_ENVIRONMENT=$TEST_ENVIRONMENT
            # export BANK_NUM=$BANK_NUM
            # export BANK_NAME=$BANK_NAME
            export REG_PILOT_API=$REG_PILOT_API
            export REG_PILOT_FILER=$REG_PILOT_FILER
            echo "Running npx jest --testNamePattern $TEST_NAME start $TEST_FILE -- --bank-num $BANK_NUM --max-report-size $MAX_REPORT_SIZE 2>&1 | tee $LOG_FILE"

            npx jest --testNamePattern $TEST_NAME start $TEST_FILE -- --bank-num "$BANK_NUM" --max-report-size "$MAX_REPORT_SIZE" --clean "false" --keria-start-port "$KERIA_START_PORT" 2>&1 | tee "$LOG_FILE"
    fi    

    API_TEST_STATUS=${PIPESTATUS[0]}

    END_TIME=$(date +%s)
    ELAPSED_TIME=$((END_TIME - START_TIME))

    if [[ $API_TEST_STATUS -ne 0 ]]; then
        echo "API test/staging for $BANK_NAME failed. See $LOG_FILE for details."
        tail -n 25 "$LOG_FILE"
        return 1
    else
        echo "API test/staging for $BANK_NAME completed successfully."
        echo "$BANK_NAME,$ELAPSED_TIME" >> "./bank_test_logs/timing_data.csv"
    fi    
}

process_timing_data() {
    local TIMING_0_1=0
    local TIMING_1_5=0
    local TIMING_5PLUS=0
    local TOTAL_TIME=0
    local COUNT=0

    while IFS="," read -r BANK_NAME ELAPSED_TIME; do
    ((TOTAL_TIME+=ELAPSED_TIME))
    ((COUNT++))

        if [[ "$ELAPSED_TIME" -lt 60 ]]; then
            ((TIMING_0_1++))
        elif [[ "$ELAPSED_TIME" -ge 60 && "$ELAPSED_TIME" -lt 300 ]]; then
            ((TIMING_1_5++))
        else
            ((TIMING_5PLUS++))
        fi
    done < "./bank_test_logs/timing_data.csv"

    if [[ $COUNT -gt 0 ]]; then
        local AVG_TIME=$(echo "scale=2; $TOTAL_TIME / $COUNT" | bc)
        echo "========================================================="
        echo "              TIMING DISTRIBUTION SUMMARY                "
        echo "========================================================="
        echo "LESS THAN 1 MIN    : $TIMING_0_1 bank(s)"
        echo "1 TO 5 MINS        : $TIMING_1_5 bank(s)"
        echo "MORE THAN 5 MINS   : $TIMING_5PLUS bank(s)"
        echo "AVERAGE EXECUTION TIME FOR $COUNT bank(s) is $AVG_TIME seconds"
        echo "---------------------------------------------------------"
    else
        echo "User timing data not found in timing_data.csv"
    fi
}

load_test_banks() {
    SUCCESS_COUNT=0
    FAILURE_COUNT=0
    RETRY_COUNT=0
    MAX_RETRIES=$RETRY

    LAST_BANK=$((FIRST_BANK + BANK_COUNT - 1))

    # if [[ "$FAST_MODE" == true ]]; then
    remove_keria_containers
    remove_api_test_containers

    #Running API tests for all banks
    echo "---------------------------------------------------"
    echo "Running API test for all banks"
    echo "---------------------------------------------------"

    # Clear the timing_data file before starting api tests
    > "./bank_test_logs/timing_data.csv" 

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

    # Start KERIA instances for the current batch
    # for ((i = BATCH_START; i <= BATCH_END; i++)); do
    #         BANK_NAME="Bank_$i"
    #         start_keria "$BANK_NAME"
    # done

    # Running API tests for all banks in the current batch
    PIDS=()
    BANK_NAMES=()

        for ((i = BATCH_START; i <= BATCH_END; i++)); do
            BANK_NAME="Bank_$i"
            BANK_NAMES+=("$BANK_NAME")
            BANK_NUM=$i
            run_api_test $BANK_NAME $BANK_NUM &
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

        # Stop KERIA instances for the current batch
        if [[ "$STAGE_MODE" == false ]]; then
            STOP_PIDS=()
            for ((i = BATCH_START; i <= BATCH_END; i++)); do
                BANK_NAME="Bank_$i"
                stop_keria "$BANK_NAME" &                
                STOP_PIDS+=($!)
            done
        fi

        # Wait for all stop_keria processes to finish
        # for pid in "${STOP_PIDS[@]}"; do
        #     wait "$pid"
        # done
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
        # for ((BATCH_START = 0; BATCH_START < ${#FAILED_BANKS[@]}; BATCH_START += BATCH_SIZE)); do
        for ((BATCH_START = 0; BATCH_START < ${#FAILED_BANKS[@]}; BATCH_START += 1)); do
            # BATCH_END=$((BATCH_START + BATCH_SIZE - 1))
            BATCH_END=$((BATCH_START))
            if [[ $BATCH_END -ge ${#FAILED_BANKS[@]} ]]; then
                BATCH_END=$((${#FAILED_BANKS[@]} - 1))
            fi

            echo "-----------------------------------------------------------------------------------------------------------"
            echo "Retrying processing banks ${FAILED_BANKS[@]:BATCH_START:BATCH_END - BATCH_START + 1}..."
            echo "-----------------------------------------------------------------------------------------------------------"
            
            # Start KERIA instances for the failed banks in the current batch
            # for ((i = BATCH_START; i <= BATCH_END; i++)); do
            # BANK_NAME="${FAILED_BANKS[$i]}"
            #  "$BANK_NAME"
            # done

            # Retries for failed banks in the current batch
            PIDS=()
            for ((i = BATCH_START; i <= BATCH_END; i++)); do
                BANK_NAME="${FAILED_BANKS[$i]}"
                BANK_NUM=$(echo "$BANK_NAME" | sed 's/[^0-9]*//g')
                run_api_test "$BANK_NAME" "$BANK_NUM" &
                PIDS+=($!)
            done

            # Wait for all retry processes in the current batch to finish
            for pid in "${!PIDS[@]}"; do
                wait "${PIDS[$pid]}"
                API_TEST_STATUS=$?
                if [[ $API_TEST_STATUS -eq 0 ]]; then
                    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
                    if [[ "$STAGE_MODE" == false ]]; then
                        stop_keria "$BANK_NAME"
                    fi
                else
                    FAILURE_COUNT=$((FAILURE_COUNT + 1))
                    NEW_FAILED_BANKS+=("${FAILED_BANKS[$BATCH_START + pid]}")
                fi
            done

            # Stop KERIA instances for the current batch
            if [[ "$STAGE_MODE" == false ]]; then
                STOP_PIDS=()
                for ((i = BATCH_START; i <= BATCH_END; i++)); do
                    BANK_NAME="${FAILED_BANKS[$i]}"
                    stop_keria "$BANK_NAME" &
                    STOP_PIDS+=($!)
                done
            fi

            # Wait for all stop_keria processes to finish
            # for pid in "${STOP_PIDS[@]}"; do
            #     wait "$pid"
            # done
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

    # if [[ "$MODE" == "local" && "$FAILURE_COUNT" -eq 0 ]]; then
    #         stop_services_local
    # fi

    if [[ "$STAGE_MODE" == true ]]; then

        STAGING_SUMMARY_FILE="./bank_test_logs/staging_summary.txt"
        mkdir -p "$(dirname "$STAGING_SUMMARY_FILE")"
        {
        echo "========================================================="
        echo "                   STAGING SUMMARY                       "
        echo "========================================================="
        echo "START TIME         : $(TZ="America/New_York" date -r "$START_TIME" '+%B %d, %Y %I:%M %p %Z')"
        echo "END TIME           : $(TZ="America/New_York" date -r "$END_TIME" '+%B %d, %Y %I:%M %p %Z')"
        echo "TOTAL BANKS STAGED : $BANK_COUNT"
        echo "TOTAL RUNTIME      : $((ELAPSED_TIME / 3600))h:$((ELAPSED_TIME % 3600 / 60))m:$((ELAPSED_TIME % 60))s"
        echo "=========================================================="
        } | tee "$STAGING_SUMMARY_FILE"
    elif [[ "$FAST_MODE" == true ]]; then
        TEST_SUMMARY_FILE="./bank_test_logs/test_summary.txt"
        mkdir -p "$(dirname "$TEST_SUMMARY_FILE")"
        {
        echo "========================================================="
        echo "                   TEST SUMMARY                          "
        echo "========================================================="
        echo "START TIME         : $(TZ="America/New_York" date -r $START_TIME '+%B %d, %Y %I:%M %p %Z')"
        echo "END TIME           : $(TZ="America/New_York" date -r $END_TIME '+%B %d, %Y %I:%M %p %Z')"
        echo "TOTAL BANKS TESTED : $BANK_COUNT test bank logins/uploads"
        echo "SUCCESS COUNT      : $SUCCESS_COUNT"
        echo "FAILURE COUNT      : $FAILURE_COUNT"
        echo "FAILED BANK(S)     : ${FAILED_BANKS[*]:-None}"
        echo "TOTAL RUNTIME      : $((ELAPSED_TIME / 3600))h:$((ELAPSED_TIME % 3600 / 60))m:$((ELAPSED_TIME % 60))s"
        process_timing_data 
        echo "=========================================================="
        } | tee "$TEST_SUMMARY_FILE"
    fi
}

main() {
    parse_args "$@"
    check_available_banks

    npm install
    npm run build

    # if [[ "$FAST_MODE" == true && "$MODE" == "local" ]]; then
    #     start_services_local
    # fi

    # if [[ "$STAGE_MODE" == true ]]; then
    #     # generate_dockerfiles

    # fi

    load_test_banks
}

main "$@"