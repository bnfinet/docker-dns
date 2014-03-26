# docker-dns
http://github.com/bnfinet/docker-dns

nodejs app to offer dns services based on a running docker enironment

Benjamin Foote  
http://bnf.net  
ben@bnf.net   

inspired by [skydock](https://github.com/crosbymichael/skydock) and [skydns](https://github.com/skynetservices/skydns)

## the use case

You have a Docker.io environment setup.  You spin up new instances
which includes mapping specific services to multiple ports.

	you@dockerbox:~$ sudo docker ps -a
	CONTAINER ID        IMAGE                      COMMAND                CREATED             STATUS              PORTS                                             NAMES
	a03ac7d516c0        hipache:latest             supervisord -n         10 hours ago        Up 10 hours         0.0.0.0:49192->6379/tcp, 144.76.62.2:80->80/tcp   hipache                 
	f4b2dd963131        62f5bca4ec7c               /usr/sbin/sshd -D      14 hours ago        Up 14 hours         0.0.0.0:49189->22/tcp, 172.17.42.1:53->53/udp     docker-dns              
	fbc938bbfec1        sshd-nginx-phpfpm:latest   /startup.sh            3 days ago          Up 3 days           0.0.0.0:49175->22/tcp, 0.0.0.0:49176->80/tcp      awesomeapp               
	a95d1f55ea4b        07e289838094               /startup.sh            3 days ago          Up 3 days           0.0.0.0:49167->22/tcp, 0.0.0.0:49168->80/tcp      namearg                 
	e5c777e21c60        sshd:latest                /bin/sh -c /usr/sbin   3 days ago          Exit -1                                                               namearg/sshdhost,sshd   

You'd like to be able to connect to ports on your dockerbox in a useful way, but you don't
want to have to go lookup the port mapping every time you need to wire things up.  This is called
service discovery and there's a [DNS record](http://en.wikipedia.org/wiki/SRV_record) for that.

	you@laptop:~$ host -t SRV _ssh._tcp.sshdhost.docker.local
	sshdhost.docker.local has SRV record 0 10 49158 e5c777e21c60.docker.local.

or just

	you@laptop:~$ host -t SRV sshdhost.docker.local
	sshdhost.docker.local has SRV record 0 10 49158 e5c777e21c60.docker.local.

then you can do

	PORT=$(host -t SRV sshdhost.docker.local | awk '{print $7}');
	ssh -p $PORT sshdhost.docker.local

In addition you get a variety of DNS record mappings.  In this example
- sshdhost.docker.local CNAME e5c777e21c60.docker.local
- e5c777e21c60.docker.local A record

## how this works

docker-dns scans the docker api periodically and builds DNS records for each container...
- UUID is an A record
- container ID (first 12 of the UUID) is an A record
- a cleaned version of the  is CNAME to the A record
- hostname (run -h) is CNAME to the A record
- exposed ports are SRV records by looking up the 'port/proto' in /etc/services


## features

- supports a custom fake top level domain such as 'docker.local'
- maps '0.0.0.0' to a configured (possibly public) ip address


## config

Copy the config file and edit.  See documentation in the comments there.

	cp ./config/config.js.example ./config/config.js


## issues and bugs

on github please....

## next steps
- setup multi host and wildcard lookup support (_sshd.*.docker.local)
- ipv6 AAAA records
- use Docker's event stream instead of polling
- use a temporary name space for record creation
