# reg-pilot
Reg-pilot related information, issues, discussions, and more.

## Development repos and docker images
Development docker images are:
* [reg-webapp github](https://github.com/GLEIF-IT/reg-pilot-webapp) and [reg-webapp docker](https://hub.docker.com/r/2byrds/reg-webapp/tags)
* [reg-pilot-api github](https://github.com/GLEIF-IT/reg-pilot-api) and [reg-pilot-api docker](https://hub.docker.com/r/2byrds/reg-pilot-api/tags)
* [vlei-verifier github](https://github.com/GLEIF-IT/vlei-verifier) and [vlei-verifier docker](https://hub.docker.com/r/2byrds/vlei-verifier/tags)

## Demo test instances
* [Demo reg-webapp](http://reg-pilot-webapp.s3-website-us-east-1.amazonaws.com/) currently requires the [signify-browser-extension](https://github.com/WebOfTrust/signify-browser-extension) to be installed
* [Demo reg-pilot-api](http://reg-po-publi-mx2isoslcwcx-420196310.us-east-1.elb.amazonaws.com/api/doc#/) - [ping it](http://reg-po-publi-mx2isoslcwcx-420196310.us-east-1.elb.amazonaws.com/ping)

## Signing a report
At a high-level idea, each file has a digest computed on it and the file and signature are added to the zip file. The vlei-verifier will validate each signatures vs. the digest of each file.
