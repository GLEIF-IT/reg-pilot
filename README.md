# reg-pilot
Reg-pilot related information, issues, discussions, and more.

## Development repos and docker images
* [reg-webapp github](https://github.com/GLEIF-IT/reg-pilot-webapp) and [reg-webapp docker](https://hub.docker.com/r/2byrds/reg-webapp/tags) development images
* [reg-pilot-api github](https://github.com/GLEIF-IT/reg-pilot-api) and development [reg-pilot-api docker](https://hub.docker.com/r/2byrds/reg-pilot-api/tags) development images
* [vlei-verifier github](https://github.com/GLEIF-IT/vlei-verifier) and development [vlei-verifier docker](https://hub.docker.com/r/2byrds/vlei-verifier/tags) development images

## Demo test instances
* Demo keria instance url = ```https://keria-dev.rootsid.cloud/admin``` and boot url = ```https://keria-dev.rootsid.cloud```
* Demo signify passcode = ```Ap31Xt-FGcNXpkxmBYMQn```
* [Demo reg-webapp](http://reg-pilot-webapp.s3-website-us-east-1.amazonaws.com/) currently requires the [signify-browser-extension](https://github.com/WebOfTrust/signify-browser-extension) to be installed
* [Demo reg-pilot-api](https://reg-api.rootsid.cloud/api/doc#/) - [ping it](https://reg-api.rootsid.cloud/ping)
* Demo witness urls: ```"https://witness-dev01.rootsid.cloud", 
                    "https://witness-dev02.rootsid.cloud",
                    "https://witness-dev03.rootsid.cloud"```
* Demo vlei schema server: ```"http://schemas.rootsid.cloud"```

## Signing a report
At a high-level idea, each file has a digest computed on it and the file and signature are added to the zip file. The vlei-verifier will validate each signatures vs. the digest of each file.

### Test reports
You can find a variety of test report files here. We need to add signed reports for the latest test data.
* [Demo reports - We still need properly signed files by the test data AIDs](https://github.com/GLEIF-IT/vlei-verifier/tree/main/tests/data/report)
