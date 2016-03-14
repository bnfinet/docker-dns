#!/bin/bash

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
sudo docker rmi docker-dns
sudo docker build --rm -t docker-dns ${DIR}/../