# base image
# https://index.docker.io/u/dockerfile/nodejs/
FROM dockerfile/nodejs

RUN apt-get install -y git openssh-server supervisor

RUN mkdir /var/run/sshd 
RUN echo 'root:CHANGEME' | chpasswd

RUN	npm install docker-dns -g
RUN mkdir -p /var/log/supervisor

ADD ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD ./config/config.js /usr/local/lib/node_modules/docker-dns/config/config.js

EXPOSE 22
EXPOSE 53
