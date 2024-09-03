# reg-pilot
Reg-pilot related information, issues, discussions, and more.

# Project sub-modules
* signify-ts-test: integration scripts and tests to simulate use cases for the whole reg-pilot.
* proxy-server: simulates a scenario when a proxy service sits between the client and reg-pilot-api.

## Development repos and docker images
* [reg-webapp github](https://github.com/GLEIF-IT/reg-pilot-webapp) and [reg-webapp docker](https://hub.docker.com/r/2byrds/reg-webapp/tags) development images
* [reg-pilot-api github](https://github.com/GLEIF-IT/reg-pilot-api) and development [reg-pilot-api docker](https://hub.docker.com/r/gleif/reg-pilot-api/tags) development images
* [vlei-verifier github](https://github.com/GLEIF-IT/vlei-verifier) and development [vlei-verifier docker](https://hub.docker.com/r/gleif/vlei-verifier/tags) development images

## Demo test instances
* Demo keria instance url = ```https://keria-dev.rootsid.cloud/admin``` and boot url = ```https://keria-dev.rootsid.cloud```
* Demo signify passcode = ```Ap31Xt-FGcNXpkxmBYMQn```
* [Demo reg-webapp](https://reg-pilot-webapp-test.rootsid.cloud/) currently requires the [signify-browser-extension](https://github.com/WebOfTrust/signify-browser-extension) to be installed
* [Demo reg-pilot-api](https://reg-api-test.rootsid.cloud/doc#/) - [ping it](https://reg-api-test.rootsid.cloud/ping)
* Demo witness urls: ```"https://witness-dev01.rootsid.cloud", 
                    "https://witness-dev02.rootsid.cloud",
                    "https://witness-dev03.rootsid.cloud"```
* Demo vlei schema server: ```"http://schemas.rootsid.cloud"```

## Signing a report
At a high-level idea, each file has a digest computed on it and the file and signature are added to the zip file. The vlei-verifier will validate each signatures vs. the digest of each file.

### Test reports
You can find a variety of test report files here.
* [Demo reports](https://github.com/GLEIF-IT/vlei-verifier/tree/main/tests/data/report)
