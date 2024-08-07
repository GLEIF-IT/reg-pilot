#!/bin/bash

npm run build

SIGNIFY_SECRETS="ARIWC_Qd_EkasswswqOxI" TEST_ENVIRONMENT="nordlei_dev" npx jest ./report.test.ts

SIGNIFY_SECRETS="ARIWC_Qd_EkasswswqOxI" TEST_ENVIRONMENT="nordlei_dev" REG_PILOT_API="http://127.0.0.1:8000" VLEI_VERIFIER="http://127.0.0.1:7676" npx jest ./vlei-verification.test.ts