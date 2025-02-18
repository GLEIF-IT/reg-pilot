#!/bin/bash
sudo apt install git-all
git
mkdir repos
cd repos/ || exit
git clone https://github.com/GLEIF-IT/reg-pilot.git
cd reg-pilot/ || exit
cd signify-ts-test/ || exit

sudo apt install node
sudo apt install node-all
sudo apt install nodejs
sudo apt install npm
sudo apt install nodejs --fix-missing
sudo apt install npm --fix-missing
npm install
npm run build

sudo apt install docker
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
# Add the repository to Apt sources:
echo   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" |   sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker ps

sudo npm test


# sudo docker ps
# sudo docker logs 9d4388940c80
# git status
# git fetch --all