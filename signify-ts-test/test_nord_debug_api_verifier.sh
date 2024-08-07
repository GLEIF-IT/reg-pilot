#!/bin/bash

npm run build

secret="ARIWC_Qd_EkasswswqOxI"
role="DataSubmitter"

SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="nordlei_dev" ROLE_NAME="$role" npx jest ./report.test.ts

SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="nordlei_dev" REG_PILOT_API="http://127.0.0.1:8000" VLEI_VERIFIER="http://127.0.0.1:7676" ROLE_NAME="$role" npx jest ./vlei-verification.test.ts