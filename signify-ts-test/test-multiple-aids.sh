#!/bin/bash

# Extracted values from resolve-env.ts
WAN='BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha'
WIL='BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM'
WES='BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX'

# Check if TEST_ENVIRONMENT is set
if [ -z "$TEST_ENVIRONMENT" ]; then
    # Default values for 'docker' environment
    : "${TEST_ENVIRONMENT:=docker}"
    : "${ROLE_NAME:=EBADataSubmitter}"
    : "${REG_PILOT_API:=http://127.0.0.1:8000}"
    : "${VLEI_VERIFIER:=http://127.0.0.1:7676}"
    : "${KERIA:=http://127.0.0.1:3901}"
    : "${KERIA_BOOT:=http://127.0.0.1:3903}"
    : "${WITNESS_URLS:=http://witness-demo:5642,http://witness-demo:5643,http://witness-demo:5644}"
    : "${WITNESS_IDS:=$WAN,$WIL,$WES}"
    : "${VLEI_SERVER:=http://vlei-server:7723}"
fi

# Export environment variables
export TEST_ENVIRONMENT ROLE_NAME REG_PILOT_API VLEI_VERIFIER KERIA KERIA_BOOT WITNESS_URLS WITNESS_IDS VLEI_SERVER

# Print environment variable values
echo "TEST_ENVIRONMENT=$TEST_ENVIRONMENT"
echo "ROLE_NAME=$ROLE_NAME"
echo "REG_PILOT_API=$REG_PILOT_API"
echo "VLEI_VERIFIER=$VLEI_VERIFIER"
echo "KERIA=$KERIA"
echo "KERIA_BOOT=$KERIA_BOOT"
echo "WITNESS_URLS=$WITNESS_URLS"
echo "WITNESS_IDS=$WITNESS_IDS"
echo "VLEI_SERVER=$VLEI_SERVER"

# Check if the only argument is --all
if [[ $# -eq 1 && $1 == "--all" ]]; then
    set -- --docker=verify --build --data --report --verify
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --docker=*)
            docker_action="${1#*=}"
            case $docker_action in
                deps | verify)
                    docker compose down -v
                    docker compose up $docker_action -d
                    ;;
                *)
                    echo "Unknown docker action: $docker_action"
                    ;;
            esac
            shift # past argument
            ;;
        --build)
            npm run build
            shift # past argument
            ;;
        --data)
            export LEI=875500ELOZEL05BVXV37
            export SIGNIFY_SECRETS=D_PbQb0ESFGQgK-kDWd3f,BTaq43FG3G34GGSQJp6mb,BRFHnuf98vnih8hfinf4g,nf98hUHUy8Vt5tvdyaYV7
            npx jest ./singlesig-vlei-issuance.test.ts
            shift # past argument
            export LEI=875500ELOZEL05BVXV37
            export SIGNIFY_SECRETS=D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm
            npx jest ./singlesig-vlei-issuance.test.ts
            shift # past argument
            export LEI=875500ELOZNFID93NF83
            export SIGNIFY_SECRETS=D_PbQfw4fvFEf4-fesefF,NUH98hbsuhd8hdua8hnfa,ANud8hnahdaNUnfsanofN,defh7b7g7gfaBuf83bf0f
            npx jest ./singlesig-vlei-issuance.test.ts
            shift # past argument
            ;;
        --report)
            export LEI=875500ELOZEL05BVXV37
            export SIGNIFY_SECRETS=D_PbQb0ESFGQgK-kDWd3f,BTaq43FG3G34GGSQJp6mb,BRFHnuf98vnih8hfinf4g,nf98hUHUy8Vt5tvdyaYV7
            npx jest ./report.test.ts
            shift # past argument
            export LEI=875500ELOZEL05BVXV37
            export SIGNIFY_SECRETS=D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm
            npx jest ./report.test.ts
            shift # past argument
            export LEI=875500ELOZNFID93NF83
            export SIGNIFY_SECRETS=D_PbQfw4fvFEf4-fesefF,NUH98hbsuhd8hdua8hnfa,ANud8hnahdaNUnfsanofN,defh7b7g7gfaBuf83bf0f
            npx jest ./report.test.ts
            shift # past argument
            ;;     
        --verify)
            export SIGNIFY_SECRETS_MULTI_AID="D_PbQb0ESFGQgK-kDWd3f,BTaq43FG3G34GGSQJp6mb,BRFHnuf98vnih8hfinf4g,nf98hUHUy8Vt5tvdyaYV7;D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm;D_PbQfw4fvFEf4-fesefF,NUH98hbsuhd8hdua8hnfa,ANud8hnahdaNUnfsanofN,defh7b7g7gfaBuf83bf0f"
            npx jest ./multi-user-api-permissions.test.ts -t "reg-pilot-api"
            shift # past argument
            ;;
        *)
            echo "Unknown argument: $1"
            shift # past argument
            ;;
    esac
done