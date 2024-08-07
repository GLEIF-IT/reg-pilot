#!/bin/bash

docker compose down -v;
docker compose up verify -d;

npm run build

SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm" TEST_ENVIRONMENT="docker" npx jest ./singlesig-vlei-issuance.test.ts

SIGNIFY_SECRETS="CbII3tno87wn3uGBP12qm" TEST_ENVIRONMENT="docker" npx jest ./report.test.ts

SIGNIFY_SECRETS="CbII3tno87wn3uGBP12qm" TEST_ENVIRONMENT="docker" npx jest ./vlei-verification.test.ts