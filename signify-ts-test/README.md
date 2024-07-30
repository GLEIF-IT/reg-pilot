To run the tests, the steps include:
* make sure at this directory level.

# Run docker services
* OPTIONALLY run the deps docker services:
```docker compose down -v;docker compose up deps -d```
* OR OPTIONALLY run all of the verify services:
```docker compose down -v; docker compose up verify -d```

# Run the tests
* Build the tests: ```npm run build```
* Run the vlei issuance test (supplying predictable secrets) in order to populate the docker keria instance:
```SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm" npx jest ./singlesig-vlei-issuance.test.ts```
* Run the vlei verification test (supplying predictable secrets) in order test the api/vlei-verifier:
```SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm" npx jest ./vlei-verification.test.ts```