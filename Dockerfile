# This file describes how to build hipache into a runnable linux container with all dependencies installed
# To build:
# 1) Install docker (http://docker.io)
# 2) Clone docker-dns repo if you haven't already: git clone https://github.com/bnfinet/docker-dns.git
# 3) Build: cd docker-dns && docker build .
# 4) Run: ./docker-run <imageid> <hostname>

# base image
# https://index.docker.io/u/dockerfile/nodejs/
FROM dockerfile/nodejs

RUN apt-get install -y git openssh-server supervisor

RUN mkdir /var/run/sshd 
RUN echo 'root:CHANGEME' | chpasswd

RUN	npm install docker-dns -g
RUN mkdir -p /var/log/supervisor

ADD ./config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD ./config/config.js /usr/lib/node_modules/docker-dns/config/config.js

EXPOSE 22
EXPOSE 53/udp
cmd	["supervisord", "-n"]