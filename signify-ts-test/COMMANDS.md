This is a log of commands that were used to run the tests and the services.
The latest unique/useful commands should appear at the top.
See the README.md in this dir for more information on how to run the tests and services.

# Run docker services

- If you will run the api/verification locally/debug then run the dependency docker services:
  `docker compose down -v;docker compose up deps -d`
- If you want to run all of the verify services in docker:
  `docker compose down -v; docker compose up verify -d`

# Example for how to run the verification test against a remote keria instance that has its own test data (like nord_demo)

- Example command for using NordLEI dry-run identity to sign a report and then verify it against local
`SIGNIFY_SECRETS="BhqEDDNmpyWgxT8ZIKWdw" TEST_ENVIRONMENT="nordlei_dry" ROLE_NAME="testbank_submitter" REG_PILOT_API=http://127.0.0.1:8000 VLEI_VERIFIER=http://127.0.0.1:7676 ./test.sh --build --report --verify`
- Example command for using NordLEI identity to sign a report and then verify it against local API/Verifier:
  `SIGNIFY_SECRETS="A7DKYPya4oi6uDnvBmjjp" TEST_ENVIRONMENT="nordlei_demo" ROLE_NAME="unicredit-datasubmitter" REG_PILOT_API=http://127.0.0.1:8000 VLEI_VERIFIER=http://127.0.0.1:7676 ./test.sh --build --report --verify`
- Example to run all defaults via docker:
- Run the test.sh script:
`./test.sh --all`