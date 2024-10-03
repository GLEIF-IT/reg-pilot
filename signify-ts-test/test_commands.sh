#!/bin/bash

exitOnFail() {
    if [ $? -ne 0 ]; then
        echo "Failed to execute command: $1"
        exit 1
    fi
}

# ./test.sh --docker=verify
exitOnFail "$1"
./test.sh --build
exitOnFail "$1"
UNSIGNED_REPORTS="$(pwd)/test/data/orig_reports/DUMMYLEI123456789012.CON_FR_PILLAR3010000_CONDIS_2023-12-31_20230405102913000.zip" ./test.sh --report="simple"
exitOnFail "$1"
./test.sh --verify
exitOnFail "$1"
./test.sh --all --fast
exitOnFail "$1"
./test.sh --all