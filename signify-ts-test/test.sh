#!/bin/bash

exitOnFail() {
    if [ $? -ne 0 ]; then
        echo "Failed to execute command: $1"
        exit 1
    fi
}

# Updated deduplication function
deduplicate_array() {
    local array_name=$1
    eval "local arr=(\"\${${array_name}[@]}\")"
    local seen=()
    local unique=()
    for item in "${arr[@]}"; do
        if [[ ! " ${seen[*]} " =~ " ${item} " ]]; then
            unique+=("$item")
            seen+=("$item")
        fi
    done
    eval "$array_name=(\"\${unique[@]}\")"
}

# Updated deduplication function
deduplicate_array() {
    local array_name=$1
    eval "local arr=(\"\${${array_name}[@]}\")"
    local seen=()
    local unique=()
    for item in "${arr[@]}"; do
        if [[ ! " ${seen[*]} " =~ " ${item} " ]]; then
            unique+=("$item")
            seen+=("$item")
        fi
    done
    eval "$array_name=(\"\${unique[@]}\")"
}

printHelp() {
    echo "Usage: test.sh [options]"
    echo "Options:"
    echo "  --fast"
    echo "      Runs --all but with less rigor for the fastest runs"
    echo "  --all"
    echo "      Runs --build --docker=verify --data --report --verify"
    echo "      Runs --build --docker=verify --data --report --verify"
    echo "  --docker=deps|verify|proxy-verify"
    echo "      deps: Setup only keria, witnesses, vlei-server services in local docker containers, you will need to specify the REG_PILOT_API and VLEI_VERIFIER environment variables"
    echo "      verify: Setup all services (keria, witnesses, vlei-server, reg-pilot-api, and vlei-verifier) in local docker containers"
    echo "      verify-proxy: Setup all services and a proxy (keria, witnesses, vlei-server, reg-pilot-api, and vlei-verifier) in local docker containers"
    echo "  --build"
    echo "      build the typescript tests"
    echo "  --data"
    echo "      run the test data generation to populate keria identifiers/credentials. will become either --data-single or --data-multi Setting JSON_SECRETS_CONFIG will override the default permutations of multisig and singlesig with multiple-aid and single-aid"
    echo "      run the test data generation to populate keria identifiers/credentials. will become either --data-single or --data-multi Setting JSON_SECRETS_CONFIG will override the default permutations of multisig and singlesig with multiple-aid and single-aid"
    echo "      run the test data generation to populate keria identifiers/credentials. will become either --data-single or --data-multi Setting JSON_SECRETS_CONFIG will override the default permutations of multisig and singlesig with multiple-aid and single-aid"
    echo "  --report"
    echo "      create signed/failure reports from original reports, see the 'signed' directory for the generated signed reports that can be uploaded"
    echo "  --verify"
    echo "      run the reg-pilot-api and vlei-verifier integration tests using the keria instance to login and upload signed/failure reports"
    echo "  --sigs"
    echo "      use sigs=1 for singlesig, otherwise multisig configuration"
    echo "  --users"
    echo "      use users=1 for single-user, otherwise mutiple-user configuration"
    echo "  --sigs"
    echo "      use sigs=1 for singlesig, otherwise multisig configuration"
    echo "  --users"
    echo "      use users=1 for single-user, otherwise mutiple-user configuration"
    echo "  --proxy"
    echo "      add a proxy service between the tests and the reg-pilot-api to test forwarded communications"
    echo "  --help"
    echo "      print this help"
    exit 0
}

clearEnv() {
    # Clear all specified environment variables
    unset TEST_ENVIRONMENT
    unset ID_ALIAS
    unset REG_PILOT_API
    unset REG_PILOT_PROXY
    unset VLEI_VERIFIER
    unset KERIA
    unset KERIA_BOOT
    unset WITNESS_URLS
    unset WITNESS_IDS
    unset VLEI_SERVER
    unset CONFIGURATION
    unset SPEED
}

# Call the clearEnv function to clear the environment variables
# clearEnv

sig_types=()
user_types=()
handle_users() {
    # check if users=1, then, otherwise all other numbers y
    handle_arguments "--users=1" "" 'user_types+=("single-user")'
    handle_arguments "--users" "" 'user_types+=("multi-user")'
    handle_arguments "--sigs=1" "" 'sig_types+=("singlesig")'
    handle_arguments "--sigs" "" 'sig_types+=("multisig")'

    # Check if arrays are empty
    if [ ${#sig_types[@]} -eq 0 ] && [ ${#user_types[@]} -eq 0 ]; then
        echo "No sig_types or user_types specified, so using default permutations"
        sig_types=("multisig" "singlesig")
        user_types=("multi-user" "single-user")
    else
        # Parse the secrets json config
        # for instance multisig-multiple-users should result in sig_types=multisig and user_types=multiple-user
        echo "Argument is set"
    fi
    # Call deduplication function for each array
    deduplicate_array sig_types
    deduplicate_array user_types
    echo "Finished setting sig_types ${sig_types[*]} and user_types ${user_types[*]}"
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
    export TEST_ENVIRONMENT ID_ALIAS REG_PILOT_API REG_PILOT_PROXY VLEI_VERIFIER KERIA KERIA_BOOT WITNESS_URLS WITNESS_IDS VLEI_SERVER CONFIGURATION SPEED

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
}

checkArgs() {
    for arg in "${args[@]}"; do
        case $arg in
            --help|--all|--fast|--build|--docker=*|--data|--report|--report=*|--verify|--proxy|--users|--users=1|--sigs|--sigs=1)
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

handle_users
handle_users

handle_arguments "--help" "" 'printHelp'
handle_arguments "--all" '--build --docker=verify --data --report --verify' 'echo "--all replaced with --build --docker=verify --data --report --verify"' 
handle_arguments "--fast" "" 'SPEED="fast"' 'export SPEED' 'echo "Using speed settings: ${SPEED}"'
handle_arguments "--build" "" 'npm run build'


handleEnv
# Parse non-workflow arguments
# Parse non-workflow arguments
for arg in "${args[@]}"; do
    # echo "Processing step argument: $arg"
    case $arg in
        --docker=*)
            docker_action="${arg#*=}"
            case $docker_action in
                deps | verify | proxy-verify)
                    echo "Running docker compose $docker_action"
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
        --report=*)
            report_type="${arg#*=}"
            case $report_type in
                external_manifest | simple | unfoldered | unzipped | fail)
                    handle_arguments "${arg}" "--report" 'export REPORT_TYPES="$report_type"' 'echo "Completed processing ${arg[i]} and exported REPORT_TYPE as ${REPORT_TYPES}"'
            esac
            ;;
            
    esac
done

# Parse workflow arguments
for arg in "${args[@]}"; do
    case $arg in
        *)
            echo "Processing workflow argument: $arg"
            # setting="${arg#*=}"
            # echo "Processing workflow setting: $setting"
            for sig_type in "${sig_types[@]}"; do
                for user_type in "${user_types[@]}"; do
                    wfile="${sig_type}-${user_type}-${arg#--}.yaml"
                    wfile="${sig_type}-${user_type}-${arg#--}.yaml"
                    wpath="$(pwd)/src/workflows/${wfile}"
                    cfile="configuration-${sig_type}-${user_type}.json"
                    cpath="$(pwd)/src/config/${cfile}"
                    if [ -f "$wpath" ]; then
                        export WORKFLOW="$wfile"
                        if [ -f "$cpath" ]; then
                            export CONFIGURATION="$cfile"
                            echo "LAUNCHING - Workflow file ${wpath} exists and Configuration file ${cpath} exists"
                            npm run run-workflow.ts --runInBand --detectOpenHandles --forceExit
                            exitOnFail "$1"
                        else
                            echo "SKIPPING - Configuration file ${cpath} does not exist"
                        fi
                    else
                        echo "SKIPPING - Workflow file ${wpath} does not exist"
                        echo "SKIPPING - Workflow file ${wpath} does not exist"
                    fi
                done
            done
            args=("${args[@]/$arg}")
            ;;
    esac
done