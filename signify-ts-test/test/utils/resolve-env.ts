export type TestEnvironmentPreset = 'local' | 'docker' | 'rootsid_dev' | 'rootsid_test' | 'nordlei_dev' | 'nordlei_test';

export interface TestEnvironment {
    preset: TestEnvironmentPreset;
    url: string;
    bootUrl: string;
    vleiServerUrl: string;
    witnessUrls: string[];
    witnessIds: string[];
}

const WAN = 'BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha';
const WIL = 'BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM';
const WES = 'BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX';

export function resolveEnvironment(
    input?: TestEnvironmentPreset
): TestEnvironment {
    const preset = input ?? process.env.TEST_ENVIRONMENT ?? 'docker';

    switch (preset) {
        case 'docker':
            return {
                preset: preset,
                url: 'http://127.0.0.1:3901',
                bootUrl: 'http://127.0.0.1:3903',
                witnessUrls: [
                    'http://witness-demo:5642',
                    'http://witness-demo:5643',
                    'http://witness-demo:5644',
                ],
                witnessIds: [WAN, WIL, WES],
                vleiServerUrl: 'http://vlei-server:7723',
            };
        case 'local':
            return {
                preset: preset,
                url: 'http://127.0.0.1:3901',
                bootUrl: 'http://127.0.0.1:3903',
                vleiServerUrl: 'http://localhost:7723',
                witnessUrls: [
                    'http://localhost:5642',
                    'http://localhost:5643',
                    'http://localhost:5644',
                ],
                witnessIds: [WAN, WIL, WES],
            };
        case 'rootsid_dev':
            return {
                preset: preset,
                // url: "http://keria--publi-7wqhypzd56ee-cc3c56cbeced4f45.elb.us-east-1.amazonaws.com/admin",
                // bootUrl: "http://keria--publi-7wqhypzd56ee-cc3c56cbeced4f45.elb.us-east-1.amazonaws.com:3903",
                url: "https://keria-dev.rootsid.cloud/admin",
                bootUrl: "https://keria-dev.rootsid.cloud",
                witnessUrls: [
                    "https://witness-dev01.rootsid.cloud", 
                    "https://witness-dev02.rootsid.cloud",
                    "https://witness-dev03.rootsid.cloud"
                ],
                witnessIds: [WAN, WIL, WES],
                vleiServerUrl: 'http://schemas.rootsid.cloud',
            };
        case 'rootsid_test':
            return {
                preset: preset,
                url: "https://keria-demoservice.rootsid.cloud/admin",
                bootUrl: "https://keria-demoservice.rootsid.cloud",
                witnessUrls: [
                    "https://witness-dev01.rootsid.cloud", 
                    "https://witness-dev02.rootsid.cloud",
                    "https://witness-dev03.rootsid.cloud"
                ],
                witnessIds: [WAN, WIL, WES],
                vleiServerUrl: 'http://schemas.rootsid.cloud',
            };
        case 'nordlei_dev':
            return {
                preset: preset,
                url: "https://demo.wallet.vlei.tech/",
                bootUrl: "https://demo.wallet.vlei.tech/boot",
                witnessUrls: [
                    "https://william.witness.vlei.io/oobi",
                    "https://wesley.witness.vlei.io/oobi",
                    "https://whitney.witness.vlei.io/oobi",
                    "https://wilma.witness.vlei.io/oobi",
                    "https://wilbur.witness.vlei.io/oobi"
                ],
                witnessIds: [
                    "BB6_wAm4rtFPRFg1qJHbC1RWNcRKMth2sFw6MgSqFKg_",
                    "BGJvFwob-UV5J1vSbuCroz27k4FGaZE992K4sc79cD54",
                    "BMMOAZ4Ujv0jP3VhCAHmx9yTSBoP1sAoDjFXas14JYG-",
                    "BIrxc3loHN4kQ2HN8Ev-bisMBZzkdfXQdwl4KKdy2iZh",
                    "BDTChgVW3pAxkYCYDVWV9DQYu_FTZ8laD-WhpFHvY9SQ"
                ],
                vleiServerUrl: 'http://schemas.rootsid.cloud',
            };
        case 'nordlei_test':
            return {
                preset: preset,
                url: "https://demo.wallet.vlei.tech/",
                bootUrl: "https://demo.wallet.vlei.tech/boot",
                witnessUrls: [
                    "https://william.witness.vlei.io/oobi",
                    "https://wesley.witness.vlei.io/oobi",
                    "https://whitney.witness.vlei.io/oobi",
                    "https://wilma.witness.vlei.io/oobi",
                    "https://wilbur.witness.vlei.io/oobi"
                ],
                witnessIds: [
                    "BB6_wAm4rtFPRFg1qJHbC1RWNcRKMth2sFw6MgSqFKg_",
                    "BGJvFwob-UV5J1vSbuCroz27k4FGaZE992K4sc79cD54",
                    "BMMOAZ4Ujv0jP3VhCAHmx9yTSBoP1sAoDjFXas14JYG-",
                    "BIrxc3loHN4kQ2HN8Ev-bisMBZzkdfXQdwl4KKdy2iZh",
                    "BDTChgVW3pAxkYCYDVWV9DQYu_FTZ8laD-WhpFHvY9SQ"
                ],
                vleiServerUrl: 'http://schemas.rootsid.cloud',
            };
        default:
            throw new Error(`Unknown test environment preset '${preset}'`);
    }
}
