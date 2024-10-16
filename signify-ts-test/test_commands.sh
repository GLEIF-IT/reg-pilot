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
./test.sh --users=1 --sigs=1 --docker=verify --data
exitOnFail "$1"
./test.sh --users=1 --sigs --docker=verify --data
exitOnFail "$1"
./test.sh --users --sigs=1 --docker=verify --data
exitOnFail "$1"
./test.sh --users --sigs --docker=verify --data
exitOnFail "$1"
./test.sh --users --sigs --report
exitOnFail "$1"
./test.sh --users --sigs --verify
exitOnFail "$1"
./test.sh --all
# KERIA=https://keria.rootsid.cloud/admin KERIA_BOOT=https://keria.rootsid.cloud/ WITNESS_URLS= WITNESS_IDS= VLEI_SERVER="http://schemas.rootsid.cloud" REG_PILOT_API="https://reg-api-test.rootsid.cloud/docs/" ./test.sh --build --users=1 --sigs=1 --data