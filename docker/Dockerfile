# This file describes how to build hipache into a runnable linux container with all dependencies installed
# To build:
# 1) Install docker (http://docker.io)
# 2) Clone docker-dns repo if you haven't already: git clone https://github.com/bnfinet/docker-dns.git
# 3) Build: cd docker-dns/docker && ./build_docker.sh
# 4) Run: ./run_docker.sh <imageid> <hostname>

# base image
# https://index.docker.io/u/dockerfile/nodejs/
FROM dockerfile/nodejs

RUN apt-get install -y supervisor

RUN	npm install docker-dns -g
RUN mkdir -p /var/log/supervisor

ADD ./config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD ./config/config.js /usr/lib/node_modules/docker-dns/config/config.js

EXPOSE 53/udp
cmd	["supervisord", "-n"]