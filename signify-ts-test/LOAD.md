# Local load test

Run the test script with --mode set to 'local' and specify the number of banks:
` ./test-load.sh --mode local --bank-count 5`

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
```

After completing the API/Verifier tests, the corresponding downloaded report files are cleaned up:

```
Cleaning up report files for Bank_3...
```

```
 PASS  test/run-bank-reports-cleanup.test.ts
  ✓ bank-reports-cleanup (65 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        0.858 s, estimated 2 s
...
Report files for Bank_3 cleaned up successfully.
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

# Remote load test

To run the remote test, run the test script with the --mode flag set to 'remote' and specify the number of banks. The --api-url flag is required to specify the target API URL for the test: `./test-load.sh --mode remote --bank-count 10 --api-url https://reg-api-test.rootsid.cloud`

The test will connect to the specified remote API, and KERIA agents for the selected banks will be [downloaded from docker](https://hub.docker.com/r/ronakseth96/keria/tags) and started, similar to the local mode workflow.

```
=== Starting Test for Bank_1 ===
Starting KERIA for Bank_1 with image ronakseth96/keria:TestBank_1...
[+] Running 2/2
 ✔ Network signify-ts-test_default    Created
 ✔ Container signify-ts-test-keria-1  Started
```

Similar to the local mode, the [configuration and signed reports](https://github.com/aydarng/bank_reports) for each bank will be downloaded and extracted.

```
Downloading reports for Bank_1...
...

 PASS  test/run-bank-reports-download.test.ts
  ✓ bank-reports-download (615 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.41 s, estimated 2 s
```

Now,the API/Verifier tests will be performed using the downloaded artifacts.

```
Running remote test workflow for Bank_1 with API URL: https://reg-api-test.rootsid.cloud...
...
Executing: Running API test for ecr-aid-1 user...
...
ping response Response {
      status: 200,
      statusText: 'OK',
      headers: Headers {
        date: 'Tue, 03 Dec 2024 16:42:18 GMT',
        'content-type': 'application/json',
        'content-length': '6',
        connection: 'keep-alive',
        server: 'uvicorn'
      },
      body: ReadableStream { locked: false, state: 'readable', supportsBYOB: true },
      bodyUsed: false,
      ok: true,
      redirected: false,
      type: 'basic',
      url: 'https://reg-api-test.rootsid.cloud/ping'
    }
...
login response Response {
      status: 202,
      statusText: 'Accepted',
      headers: Headers {
        date: 'Tue, 03 Dec 2024 16:42:19 GMT',
        'content-type': 'application/json',
        'content-length': '22615',
        connection: 'keep-alive',
        server: 'uvicorn'
      },
      body: ReadableStream { locked: false, state: 'readable', supportsBYOB: true },
      bodyUsed: false,
      ok: true,
      redirected: false,
      type: 'basic',
      url: 'https://reg-api-test.rootsid.cloud/login'
    }
```

```
Processing file: /Users/ronakseth/reg-pilot/signify-ts-test/test/data/signed_reports/EMKW
...
PASS  test/run-workflow-bank-api.test.ts (8.538 s)
  ✓ api-verifier-bank-test-workflow (7147 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        8.579 s, estimated 9 s
Ran all test suites matching /.\/run-workflow-bank-api.test.ts/i.
```

After completing the API/Verifier test, the corresponding downloaded report files are cleaned up:

```
Cleaning up report files for Bank_10...
```

```
 PASS  test/run-bank-reports-cleanup.test.ts
  ✓ bank-reports-cleanup (64 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.945 s
...
Report files for Bank_10 cleaned up successfully.
Test successful for Bank_10.
```

Since this test involves interacting with the target API remotely, no local services are started. However, KERIA agents are initialized for each bank to interact with the target API and facilitate the test workflow.

After the test completes, a summary of the results will be displayed for all banks.

```
=== Completed Test for Bank_10 ===
=================================
           TEST SUMMARY
=================================
TOTAL BANKS TESTED: 10
SUCCESS COUNT: 10
FAILURE COUNT: 0
=================================
```
