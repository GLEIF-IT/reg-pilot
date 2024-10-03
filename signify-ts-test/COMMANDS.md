This is a log of commands that were used to run the tests and the services.
The latest unique/useful commands should appear at the top.
See the README.md in this dir for more information on how to run the tests and services.

# Run docker services

- If you will run the api/verification locally/debug then run the dependency docker services:
  `docker compose down -v;docker compose up deps -d`
- If you want to run all of the verify services in docker:
  `docker compose down -v; docker compose up verify -d`

# Example for how to run the verification test against a remote keria instance that has its own test data (like nord_demo)

- Print the help message:
  `./test.sh --help`
- Example to run all tests w/ defaults via docker:
  `./test.sh --all`
- Example to sign only one report:
  `UNSIGNED_REPORTS="DUMMYLEI123456789012.CON_FR_PILLAR3010000_CONDIS_2023-12-31_20230405102913000.zip" ./test.sh --report`
- Example command for using NordLEI dry-run identity to sign a report and then verify it against local API/Verifier:
  `TEST_ENVIRONMENT="nordlei_dry" ID_ALIAS="testbank_submitter" REG_PILOT_API=http://127.0.0.1:8000 VLEI_VERIFIER=http://127.0.0.1:7676 ./test.sh --build --report --verify`
- Example command for using NordLEI identity to sign a report and then verify it against local API/Verifier:
  `TEST_ENVIRONMENT="nordlei_demo" ID_ALIAS="unicredit-datasubmitter" REG_PILOT_API=http://127.0.0.1:8000 VLEI_VERIFIER=http://127.0.0.1:7676 SECRETS_JSON_CONFIG="singlesig-single-aid-nord-demo" ./test.sh --build --report --verify`
