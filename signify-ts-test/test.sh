#!/bin/bash

exitOnFail() {
    if [ $? -ne 0 ]; then
        echo "Failed to execute command: $1"
        exit 1
    fi
}

printHelp() {
    echo "Usage: test.sh [options]"
    echo "Options:"
    echo "  --fast"
    echo "      Runs --all but with less rigor for the fastest runs"
    echo "  --all"
    echo "      Runs --build, --docker=verify, --data, --report, and --verify"
    echo "  --docker=deps|verify|proxy-verify"
    echo "      deps: Setup only keria, witnesses, vlei-server services in local docker containers, you will need to specify the REG_PILOT_API and VLEI_VERIFIER environment variables"
    echo "      verify: Setup all services (keria, witnesses, vlei-server, reg-pilot-api, and vlei-verifier) in local docker containers"
    echo "      verify-proxy: Setup all services and a proxy (keria, witnesses, vlei-server, reg-pilot-api, and vlei-verifier) in local docker containers"
    echo "  --build"
    echo "      build the typescript tests"
    echo "  --data"
    echo "      run the test data generation to populate keria identifiers/credentials. will become either --data-single or --data-multi Setting JSON_SECRETS_CONFIG will override the default permutations of multisig and singlesig with multiple-aid and single-aid"
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

sig_types=("multisg" "singlesig")
id_types=("multiple-aid" "single-aid")
user_types=()
handleUsers() {
    # Check if SECRETS_JSON_CONFIG is set
    if [ -z "$SECRETS_JSON_CONFIG" ]; then
        echo "SECRETS_JSON_CONFIG is not set, using permutations of ${sig_types[*]} and ${id_types[*]}"    
    else
        # Parse the secrets json config
        # for instance multisig-multiple-aid should result in sig_types=multisig and id_types=multiple-aid
        sig_types=()
        id_types=()
        for secret in $(echo $SECRETS_JSON_CONFIG | sed "s/,/ /g"); do
            IFS='-' read -r -a secret_parts <<< "$secret"
            sig_types+=("${secret_parts[0]}")
            id_types+=("${id_type[1]}")
        done
    fi

    if [[ -z "$WORKFLOW" ]]; then
        echo "WORKFLOW is not set, using sig_types ${sig_types[*]} and id_types ${id_types[*]} to set workflows"
        if [[ "${id_types[1]}" == "single-aid" ]]; then
            user_types+=("single-user")
        fi
        if [[ "${id_types[1]}" == "multiple-aid" ]]; then
            user_types+=("multi-user")
        fi
    else
        # Parse the workflow
        # for instance issue-credentials-multisig-single-user.yaml should result in sig_types=multisig and user_types=single-user
        for workflow in $(echo $WORKFLOW | sed "s/,/ /g"); do
            IFS='-' read -r -a workflow_parts <<< "$workflow"
            sig_types+=("${workflow_parts[2]}")
            user_types+=("${user_type[3]}")
        done
    fi

    echo "Finished setting sig_types ${sig_types[*]} and id_types ${id_types[*]} and user_types ${user_types[*]}"
}

handleEnv() {
    # Check if TEST_ENVIRONMENT is set
    if [ -z "$TEST_ENVIRONMENT" ]; then
        echo "TEST_ENVIRONMENT is not set, setting to docker"
        # Default values for 'docker' environment
        : "${TEST_ENVIRONMENT:=docker}"
        # : "${WORKFLOW:=issue-credentials-singlesig-single-user.yaml}"
    fi

    # Export environment variables
    export TEST_ENVIRONMENT ID_ALIAS REG_PILOT_API REG_PILOT_PROXY VLEI_VERIFIER KERIA KERIA_BOOT WITNESS_URLS WITNESS_IDS VLEI_SERVER SECRETS_JSON_CONFIG SPEED WORKFLOW

    # Print environment variable values
    echo "TEST_ENVIRONMENT=$TEST_ENVIRONMENT"
    echo "ID_ALIAS=$ID_ALIAS"
    echo "REG_PILOT_API=$REG_PILOT_API"
    echo "REG_PILOT_PROXY=$REG_PILOT_PROXY"
    echo "VLEI_VERIFIER=$VLEI_VERIFIER"
    echo "KERIA=$KERIA"
    echo "KERIA_BOOT=$KERIA_BOOT"
    echo "WITNESS_URLS=$WITNESS_URLS"
    echo "WITNESS_IDS=$WITNESS_IDS"
    echo "VLEI_SERVER=$VLEI_SERVER"
    echo "UNSIGNED_REPORTS=$UNSIGNED_REPORTS"
    echo "SPEED=$SPEED"
    echo "WORKFLOW=$WORKFLOW"
}

checkArgs() {
    for arg in "${args[@]}"; do
        case $arg in
            --help|--all|--fast|--build|--docker=*|--data|--data=*|--report|--report=*|--verify|--proxy)
                ;;
            *)
                echo "Unknown argument: $arg"
                printHelp
                ;;
        esac
    done
}

handle_arguments() {
    local arg_to_handle=$1
    # echo "arg to handle ${arg_to_handle}"
    local replacement=$2
    # Convert the string into an array
    IFS=' ' read -r -a additional_args <<< "${replacement}"
    # echo "replacement ${additional_args[*]}"
    shift
    shift
    local commands=("$@")
    # echo "commands ${commands[*]}"
    
    for i in "${!args[@]}"; do
        if [[ "${args[i]}" == "$arg_to_handle" ]]; then
            # echo "Processing ${arg_to_handle} argument"
            for cmd in "${commands[@]}"; do
                eval "$cmd"
                exitOnFail "$1"
            done
            echo "completed processing ${arg_to_handle} argument"
            args=("${args[@]:0:i}" "${args[@]:i+1}")
            # Append additional arguments to the args array
            args+=("${additional_args[@]}")
            # echo "Args after ${arg_to_handle} substitution: ${args[*]}"
            break
        fi
    done
    checkArgs
}

if [[ $# -eq 0 ]]; then
    printHelp
fi

args=("$@")
checkArgs

handleUsers

handle_arguments "--help" "" 'printHelp'
handle_arguments "--all" '--build --docker=verify --data --report --verify' 'echo "--all replaced with --build --docker=verify --data --report --verify"' 
handle_arguments "--fast" "" 'SPEED="fast"' 'export SPEED' 'echo "Using speed settings: ${SPEED}"'
handle_arguments "--build" "" 'npm run build'

handleEnv
# Parse arguments
for arg in "${args[@]}"; do
    # echo "Processing step argument: $arg"
    case $arg in
        --docker=*)
            docker_action="${arg#*=}"
            case $docker_action in
                deps | verify | proxy-verify)
                    docker compose down -v
                    docker compose up "$docker_action" -d --pull always
                    ;;
                *)
                    echo "Unknown docker action: $docker_action"
                    exit 1
                    ;;
            esac
            exitOnFail "$1"
            args=("${args[@]/$arg}")
            ;;
        --data)
            for sig_type in "${sig_types[@]}"; do
                for user_type in "${user_types[@]}"; do
                    wfile="issue-credentials-${sig_type}-${user_type}.yaml"
                    wpath="$(pwd)/src/workflows/${wfile}"
                    if [ -f "$wpath" ]; then
                        export WORKFLOW="$wfile"
                        npx jest ./run-vlei-issuance-workflow.test.ts
                        exitOnFail "$1"
                    else
                        echo "SKIPPING - Workflow file $(pwd)/src/workflows/${wfile} does not exist"
                    fi

                done
            done
            args=("${args[@]/$arg}")
            ;;
        --data=*)
            for sig_type in "${sig_types[@]}"; do
                for id_type in "${id_types[@]}"; do
                    export SECRETS_JSON_CONFIG="${sig_type}-${id_type}"
                    npx jest ./vlei-issuance.test.ts
                    exitOnFail "$1"
                done
            done
            export SECRETS_JSON_CONFIG="${sig_type}-${id_type}"
            npx jest ./vlei-issuance.test.ts
            exitOnFail "$1"
            args=("${args[@]/$arg}")
            ;;
        --report)
            npx jest ./report.test.ts
            exitOnFail "$1"
            args=("${args[@]/$arg}")
            ;;
        --report=*)
            report_type="${arg#*=}"
            case $report_type in
                external_manifest | simple | unfoldered | unzipped | fail)
                    export REPORT_TYPES="$report_type"
                    echo "REPORT_TYPE set to: $REPORT_TYPES"
            esac
            npx jest ./report.test.ts
            exitOnFail "$1"
            args=("${args[@]/$arg}")
            ;;
        --verify)
            npx jest ./reg-pilot-api.test.ts
            exitOnFail "$1"
            args=("${args[@]/$arg}")
            ;;
        --proxy)
            export REG_PILOT_API="${REG_PILOT_PROXY}"
            echo "Now setting api to proxy url REG_PILOT_API=$REG_PILOT_API"
            npx jest ./vlei-verification.test.ts
            exitOnFail "$1"
            args=("${args[@]/$arg}")
            ;;
        *)
            echo "Step argument unknown: $arg"
            printHelp
            ;;
    esac
done