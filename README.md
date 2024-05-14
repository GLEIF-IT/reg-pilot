# reg-pilot
Reg-pilot related information, issues, discussions, and more.

## Development repos and docker images
Development docker images are:
* [reg-webapp github](https://github.com/GLEIF-IT/reg-pilot-webapp) and [reg-webapp docker](https://hub.docker.com/r/2byrds/reg-webapp)
* [reg-pilot-api github](https://github.com/GLEIF-IT/reg-pilot-api) and [reg-pilot-api docker](https://hub.docker.com/r/2byrds/reg-pilot-api)
* [vlei-verifier github](https://github.com/GLEIF-IT/vlei-verifier) and [vlei-verifier docker](https://hub.docker.com/r/2byrds/vlei-verifier)

## Signing a report
At a high-level idea, each file has a digest computed on it and the file and signature are added to the zip file. The vlei-verifier will validate each signatures vs. the digest of each file.
