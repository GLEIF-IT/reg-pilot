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

### Accessing the KERIA Agent with the Signify Browser Extension

#### 1. Run the KERIA Agent for the Bank

To run the KERIA agent for a specific bank image (e.g., TestBank_22), follow these steps:

- **Navigate to the signify-ts directory**:
  ```
  cd /path/to/signify-ts-test
  ```
- **Run the KERIA agent in a Docker container**:
  ```
  docker run --rm -p 3901:3901 -p 3902:3902 -p 3903:3903 \
  --name bank22 \
  -e KERI_AGENT_CORS=1 \
  -e KERI_URL=http://keria:3902 \
  -e PYTHONUNBUFFERED=1 \
  -e PYTHONIOENCODING=UTF-8 \
  -v ./config/testkeria.json:/keria/config/keri/cf/keria.json \
  ronakseth96/keria:TestBank_22 \
  --config-dir /keria/config --config-file keria
  ```

#### 2. Download the Bank configuration

Retrieve the zip file containing the passcodes, configurations, and report files for the selected bank (e.g., Bank_22).

- **Download the Zip File:**

  ```
  wget https://raw.githubusercontent.com/aydarng/bank_reports/main/<Bank_22.zip>
  ```

- **Extract the Zip File:**  
  After downloading, extract the zip file to access the following:

  - Passcodes for authentication (found in `metaInf.json`)
  - Configuration/Workflow file
  - Test Report files for `ecr-aid-1`, `ecr-aid-2`, and `ecr-aid-3` users.

#### 3. Install the Signify Browser Extension

The Signify Browser Extension (Polaris) is available on the Chrome Web Store. Install it from the following link: [Polaris Chrome Extension](https://chromewebstore.google.com/detail/polaris/jmbebhefpkdgkoecphlpdfgkbgjjhhie)

#### 4. Configure the Extension

Once the extension is installed, follow these steps to configure it:

- **Open the Extension**:

  - Click on the extension icon in your browser toolbar to open it.
  - Pin the extension to your browser toolbar for easier access.

- **Navigate to the demo webapp**:

  - Go to the demo reg-webapp: [webapp](https://reg-pilot-webapp-dev.rootsid.cloud/)

- **Configure the Extension**:
  - Click on the **Configure Extension** button.
  - In the extension window, click **Allow** to grant configuration permissions.
  - Go to the **Settings** tab and configure the extension with the following details:
    - **Vendor URL**: `https://api.npoint.io/52639f849bb31823a8c0`
    - **Agent URL**: `http://localhost:3901` (This points to the KERIA agent running on your local machine)
    - **Boot URL**: `http://localhost:3903`
  - After entering the details, click **Save** to store the configuration.
- **Enter the Passcode**:

  - From the extracted `Bank_22.zip` file, find the passcode in the `metaInf.json` file.
  - Use the passcode associated with `ecr1`.

- **Connect the Extension**:
  - Click **Connect** to establish a connection between the Signify extension and the KERIA agent.

#### 5. Identifiers and Credentials

After successfully connecting the extension, you should be able to view the following:

- **Identifiers**:
  - Look for the **ecr1-AID** that has been preloaded into the extension.
  - This **ecr1 AID** will be used to select the corresponding folder for reports later.
- **Credentials**:
  - Choose the **Legal Entity Engagement Context Role vLEI Credential**.
  - Click **Sign in with Credential** to authenticate using the credential.

#### 6. Submit and Validate Reports

- After validating the credential, proceed with the following steps:

  - **Navigate to Reports**:
    - Click the button at the top left corner and select **Reports**.
  - **Select File**:
    - Click **Select File**, and from the extracted `Bank_22.zip`, navigate to the `reports` folder.
    - Inside the `reports` folder, find the `signed_reports` folder.
  - **Select AID Folder**:
    - From the `signed_reports` folder, select the AID folder associated with `ecr1` ([Identifiers](#5-identifiers-and-credentials)) and choose the corresponding folder.
    - Inside this folder, select any file (e.g., `external_manifest_orig_bundle_20240827_131325_signed.zip`).
  - **Submit the Report**:
    - Click **Submit Report**. You should see a **green indicator** indicating that the report submission was successful.
  - **Check Status**:
    - Click **Check Status** to verify the status of the report.
