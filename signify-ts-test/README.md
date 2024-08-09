To run the tests, the steps include:
* make sure you are in the `signify-ts-test` directory level.
* If you run into build errors consider removing node_modules directories and running `npm install` again.

# Run docker services
* If you will run the api/verification locally/debug then run the dependency docker services:
```docker compose down -v;docker compose up deps -d```
* If you want to run all of the verify services in docker:
```docker compose down -v; docker compose up verify -d```

# Run the tests against local docker services
* Run the test.sh script:
```./test.sh --all```

# Example for how to run the verification test against a remote keria instance that has its own test data (like rootsid_dev)
* See the test_nord_debug_api_verifier.sh as an example.
* See the options for configuring the KERI, API, VERIFIER, role name, etc. in test/utils/resolve-env.ts
