# Local load test
Run the test script with --mode set to 'local' and specify the number of banks:
``` ./test-load.sh --mode local --bank-count 5```

The local services will be started:
```
 ✔ Network signify-ts-test_default 
 ✔ Container signify-ts-test-vlei-server-1
 ✔ Container signify-ts-test-witness-demo-1
 ✔ Container signify-ts-test-reg-pilot-api-1
 ✔ Container vlei-verifier
```

The KERIA agent for Bank 1 will be [downloaded from docker](https://hub.docker.com/r/ronakseth96/keria/tags) and started.
The [configuration and signed reports](https://github.com/aydarng/bank_reports) for Bank 1 will be downloaded and extracted
```
Starting KERIA for Bank_1 with image ronakseth96/keria:TestBank_1...
[+] Running 1/1
 ✔ Container signify-ts-test-keria-1  Started                                                                                0.1s 
Downloading reports for Bank_1...
```
```
 PASS  test/run-bank-reports-download.test.ts
  ✓ bank-reports-download (777 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.198 s, estimated 2 s
```

The API/Verifier tests will be run using the downloaded artifacts:
```
Running local test workflow for Bank_3...
...
Executing: Running API test for ecr-aid-1 user
...
login response Response {
      status: 202,
      statusText: 'Accepted',
      headers: Headers {
        date: 'Tue, 03 Dec 2024 15:45:21 GMT',
        server: 'uvicorn',
        'content-length': '22615',
        'content-type': 'application/json'
      },
      body: ReadableStream { locked: false, state: 'readable', supportsBYOB: true },
      bodyUsed: false,
      ok: true,
      redirected: false,
      type: 'basic',
      url: 'http://127.0.0.1:8000/login'
    }
...
Processing file: /Users/meenyleeny/VSCode/reg-pilot/signify-ts-test/test/data/signed_reports/EBhgJl1d3Jdc6es0Uxwiyu2Qs9E-4Xq-UGKKwIedJcmk/external_manifest_orig_bundle_20240827_131325_signed.zip
...
 PASS  test/run-workflow-bank-api.test.ts
  ✓ api-verifier-bank-test-workflow (3618 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        4.424 s, estimated 5 s
Ran all test suites matching /.\/run-workflow-bank-api.test.ts/i.
Test successful for Bank_3.
```

After all bank tests have been run there will be a summary:
```
=== Completed Test for Bank_5 ===
Stopping all local services...
[+] Running 6/6
 ✔ Container signify-ts-test-verify-1         Removed                                                                                                                                                  0.0s 
 ✔ Container vlei-verifier                    Removed                                                                                                                                                 10.1s 
 ✔ Container signify-ts-test-reg-pilot-api-1  Removed                                                                                                                                                  0.4s 
 ✔ Container signify-ts-test-vlei-server-1    Removed                                                                                                                                                 10.1s 
 ✔ Container signify-ts-test-witness-demo-1   Removed                                                                                                                                                 10.2s 
 ✔ Network signify-ts-test_default            Removed                                                                                                                                                  0.1s 
=================================
           TEST SUMMARY          
=================================
TOTAL BANKS TESTED: 5
SUCCESS COUNT: 5
FAILURE COUNT: 0
=================================
```
