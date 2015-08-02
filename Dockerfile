#
# docker-dns
# a dns server for docker environments
# https://github.com/bnfinet/docker-dns
#

# This file describes how to build docker-dns into a runnable linux container with all dependencies installed
# To build:
# 1) Install docker (http://docker.io)
# 2) Build: ./build_docker.sh
# 3) put a config file in place at ./config/config.js
# 4) Run: ./run_docker.sh 

# base image
# https://index.docker.io/u/dockerfile/nodejs/
FROM node

# supervisor
RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y supervisor git
RUN mkdir -p /var/log/supervisor
ADD ./docker/config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# code
WORKDIR /opt
ADD ./ /opt/docker-dns
RUN rm -R /opt/docker-dns/docker
WORKDIR /opt/docker-dns
RUN npm install

EXPOSE 53/udp

cmd	["supervisord", "-n"]