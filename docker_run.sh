#!/bin/bash

IMAGE=$1
HOST=$2

UUID=$(sudo docker run -d -P -t -h ${HOST} --name docker-dns -p 172.17.42.1:53:53/udp -p 22 -v /var/run/docker.sock:/var/run/docker.sock ${IMAGE} /usr/sbin/sshd -D)

sudo docker logs $UUID
