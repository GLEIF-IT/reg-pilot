#!/bin/bash

docker compose down -v;
docker compose up deps -d;

npm run build

secret="CbII3tno87wn3uGBP12qm"

SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,$secret" npx jest ./singlesig-vlei-issuance.test.ts

SIGNIFY_SECRETS="$secret" TEST_ENVIRONMENT="docker" npx jest ./report.test.ts

# now you can debug the api and verifier services