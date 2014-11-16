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
FROM dockerfile/nodejs

# supervisor
RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y supervisor git
RUN mkdir -p /var/log/supervisor
ADD ./config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# code
WORKDIR /opt
RUN git clone https://github.com/bnfinet/docker-dns.git
WORKDIR /opt/docker-dns
RUN npm install

EXPOSE 53/udp

cmd	["supervisord", "-n"]