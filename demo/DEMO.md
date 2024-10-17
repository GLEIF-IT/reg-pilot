# 2024 October 11 demo script
* Must have a chromium browser (like Chrome, Edge, etc)
* Downloadable SIgnify Browser Extension https://github.com/WebOfTrust/signify-browser-extension/actions/runs/11293932566/artifacts/2045632507
    * Note: Eventually the Signify Browser Extension will be found in the Chrome Extension Catalog, similar to the NordLEI extension https://chromewebstore.google.com/detail/nord-vlei-wallet-eba/hkhokmihflofllcdeoniaamcopgjcakl. But for now, to get the latest extension package, you can download the 'artifact' of the latest Signify Browser Extension PR, for instance:
        * Latest PR github action https://github.com/WebOfTrust/signify-browser-extension/actions/runs/11293932566
        * And download the 'artifact' v0.0.1-something: ![signify browser extension artifact](image.png)
* To install the Secure extension in Chrome: Go to ```Extensions->Manage Extensions``` ![Manage Extensions](image-1.png)
* Enable ```developer mode``` ![developer mode](image-2.png)
* Click ```Load Unpacked``` ![Load Unpacked](image-3.png)
* After unzipping the artifact, and after unzipping chrome.zip, you can select the ```chrome``` folder ![Chrome folder](image-4.png)
* You now have the Polaris 0.0.1 Signify Browser Extension ![Polaris 0.0.1 Signify Browser Extension](image-5.png)
* ```pin``` the extension so it will display as an icon in your browser ![Pin the extension](image-6.png)
* Navigate to the reg-pilot test webapp https://reg-pilot-webapp-dev.rootsid.cloud/ ![reg-pilot test webapp](image-7.png)
* Click the ```configure extension``` button and notice the Signify Browser extension has a ```green '1'``` indicator meaning it needs your input: ![Green extension indicator](image-8.png)
* Click ```Allow``` button in the extension, to allow the KERIA instance values and theming to be pre-filled ![Click Allow](image-9.png)
* We are now pointing to the correct KERIA agent, i'll provide a screenshot here but also paste the text values for copy/paste if needed:![KERIA and Theming](image-10.png)
    * Vendor Url: https://api.npoint.io/52639f849bb31823a8c0
    * Agent Url: https://keria-dev.rootsid.cloud/admin
    * Boot Url: https://keria-dev.rootsid.cloud
* Click ```Save```
* Enter the following passcode to connect to the KERIA agent
    * passcode: Ap31Xt-FGcNXpkxmBYMQn
* And click 'Connect' ![Click Connect](image-11.png)
* We can now see the identifiers, credentials, and Sign-ins in the extension ![Ids and Creds](image-12.png)
* In the webapp click 'Select Credential' ![Webapp Select Credential button](image-13.png)
* Click the extension (it has a green '1' again), scroll all the way to the bottom and select the ```Legal Entity Engagement Context Role vLEI Credential``` ![Legal Entity ECR vLEI](image-14.png)
* This creates a sign-in which 'feels' like a 'session'. Click ```Sign in with Credential``` ![Sign-in created](image-15.png) ![Valid Credential](image-16.png)
* Click the hamburger menu and select 'Reports' ![Hamburger menu, reports](image-17.png)
* Click 'Select File' ![Select File](image-18.png)
* Select the 'orig_bundle_20240827_13125_signed.zip' attached here ![Select signed report](image-19.png)
* Click Submit Report, you should see a green indicator and click ```Check Status``` ![Submit report](image-20.png) ![Successfully submitted the report](image-21.png)
* What does the signature in the report look like? ![Signed report digest and signature](image-23.png)
    * It is just a signature on the sha256 digest of the bytes of the file

# Overview of the reg-pilot architecture
![Architecture overview](image-24.png)