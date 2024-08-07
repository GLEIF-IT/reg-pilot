#!/bin/bash

npm run build

secret="A7DKYPya4oi6uDnvBmjjp"
role="unicredit-datasubmitter"

SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="nordlei_demo" ROLE_NAME="$role" npx jest ./report.test.ts

SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="nordlei_demo" REG_PILOT_API="http://127.0.0.1:8000" VLEI_VERIFIER="http://127.0.0.1:7676" ROLE_NAME="$role" npx jest ./vlei-verification.test.ts