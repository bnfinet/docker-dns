# use a base image
# https://index.docker.io/u/dockerfile/nodejs/
FROM dockerfile/nodejs

RUN apt-get install git ssh-server screen

RUN mkdir /var/run/sshd 
RUN echo 'root:CHANGEME' | chpasswd

EXPOSE 22
EXPOSE 53

CMD /usr/sbin/sshd -D