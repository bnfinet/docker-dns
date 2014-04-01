#!/bin/bash

sudo docker rmi docker-dns
sudo docker build --no-cache --rm -t docker-dns .
