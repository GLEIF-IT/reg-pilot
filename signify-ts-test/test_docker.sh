#!/bin/bash

if [ $# -eq 0 ]; then
    echo "No arguments supplied. Available arguments: all, docker-deps, docker-verify, build, data, report, verify"
    exit 0
fi

# Function to check if an argument exists
function has_argument() {
    # run the tests that are passed as arguments
    local arg_to_find="$1"
    shift
    for arg in "$@"; do
        if [ "$arg" = "$arg_to_find" ] || [ "$arg" = "all" ]; then
            return 0
        fi
    done
    return 1
}

if has_argument "docker-deps" "$@"; then
    docker compose down -v;
    docker compose up deps -d;
fi

if has_argument "docker-verify" "$@"; then
    docker compose down -v;
    docker compose up verify -d;
fi

if has_argument "build" "$@"; then
    npm run build
fi

secret="CbII3tno87wn3uGBP12qm"
environment="docker"

if has_argument "data" "$@"; then
    SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,$secret" TEST_ENVIRONMENT="$environment" npx jest ./singlesig-vlei-issuance.test.ts
fi

if has_argument "report" "$@"; then
    SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="$environment" npx jest ./report.test.ts
fi

if has_argument "verify" "$@"; then
    SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="$environment" npx jest ./vlei-verification.test.ts
fi