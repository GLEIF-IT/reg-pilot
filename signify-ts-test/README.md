To run the tests, the steps include:
* make sure you are in the `signify-ts-test` directory level.

# Run docker services
* If you will run the api/verification locally/debug then run the dependency docker services:
```docker compose down -v;docker compose up deps -d```
* If you want to run all of the verify services in docker:
```docker compose down -v; docker compose up verify -d```

# Run the tests against local docker services
* Build the tests: ```npm run build```
* Run the vlei issuance test (supplying predictable secrets) in order to populate the docker keria instance:
```SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm" npx jest ./singlesig-vlei-issuance.test.ts```
* Run the generate reports test (supplying only the role secret):
```SIGNIFY_SECRETS="CbII3tno87wn3uGBP12qm" TEST_ENVIRONMENT="docker" npx jest ./report.test.ts```
* Run the vlei verification test (supplying predictable secrets) in order test the api/vlei-verifier:
```SIGNIFY_SECRETS="CbII3tno87wn3uGBP12qm" TEST_ENVIRONMENT="docker" npx jest ./vlei-verification.test.ts```

# Example for how to run the verification test against a remote keria instance that has its own test data (like rootsid_dev)
* Run the vlei verification test (supplying the proper secrets) in order test the api/vlei-verifier:
```SIGNIFY_SECRETS="Ap31Xt-FGcNXpkxmBYMQn" TEST_ENVIRONMENT="rootsid_dev" npx jest ./vlei-verification.test.ts```
