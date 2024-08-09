To run the tests, the steps include:

- make sure you are in the `signify-ts-test` directory level.
- If you run into build errors consider removing node_modules directories and running `npm install` again.

# Run docker services

- If you will run the api/verification locally/debug then run the dependency docker services:
  `docker compose down -v;docker compose up deps -d`
- If you want to run all of the verify services in docker:
  `docker compose down -v; docker compose up verify -d`

# Run the tests against local docker services

- Run the test.sh script:
  `./test.sh --all`

# Example for how to run the verification test against a remote keria instance that has its own test data (like nord_demo)

- See the options for configuring the KERI, API, VERIFIER, role name, etc. in test/utils/resolve-env.ts
- Example command for using NordLEI identity to sign a report and then verify it against local API/Verifier:
  `SIGNIFY_SECRETS="A7DKYPya4oi6uDnvBmjjp" TEST_ENVIRONMENT="nordlei_demo" ROLE_NAME="unicredit-datasubmitter" REG_PILOT_API=http://127.0.0.1:8000 VLEI_VERIFIER=http://127.0.0.1:7676 ./test.sh --build --report --verify`
