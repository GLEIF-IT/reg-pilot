To run the tests, the steps include:
* build the tests: ```npm run build```
* run the deps docker services: ```docker compose down;docker compose down;docker compose up deps -d```
* run the vlei issuance test in order to populate the docker keria instance: ```SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm" npx jest ./singlesig-vlei-issuance.test.ts```
* OPTIONALLY run the verifier docker services: ```docker compose up verify -d```
* OR OPTIONALLY run the verifier services (api and/or verifier) locally to debug.
* run the vlei verification test in order test the api/vlei-verifier:
```SIGNIFY_SECRETS="D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm" npx jest ./vlei-verification.test.ts```