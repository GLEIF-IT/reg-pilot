#!/bin/bash

SIGNIFY_SECRETS="CbII3tno87wn3uGBP12qm" TEST_ENVIRONMENT="docker" REG_PILOT_API="http://127.0.0.1:8000" VLEI_VERIFIER="http://127.0.0.1:7676" npx jest ./vlei-verification.test.ts