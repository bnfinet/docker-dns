# docker-dns
     http://github.com/GM-Alex/docker-dns  

     https://registry.hub.docker.com/u/gmalex/docker-dns

node js app to offer dns services based on a running docker environment

Fork of Benjamin Footes awesome docker-dns (https://github.com/bnfinet/docker-dns).

## docker-dns creates dns records from running containers on the fly

```docker-dns``` uses the docker api to create ```A```, ```CNAME```, and ```SRV``` records.  This makes it easy to find and use containers from other containers, from the docker host, or even from the internet.  It solves the issue of having to restart containers in the proper order to properly align ```--name``` and ```--link``` directives.  Just start your container and be confident that it can be found using dns.

	you@server:~$ ping hipache.dockerA.tld
	PING ff14ccc7acf2.local.dockerA.tld (172.17.0.7) 56(84) bytes of data.
	64 bytes from 172.17.0.7: icmp_req=1 ttl=64 time=0.046 ms
	64 bytes from 172.17.0.7: icmp_req=2 ttl=64 time=0.041 ms

## setup - configure your docker daemon

The docker daemon should be run with an additional ```-dns``` flag pointing at the ip address where docker-dns will run (usually the ```docker0``` bridge).  This will populate each running container's ```/etc/resolv.conf```.

This shows the docker daemon with -dns with dns service running behind docker0:   
   
   docker -d --bip=172.17.42.1/16 --dns=172.17.42.1

## installation

	npm install -g docker-dns
    docker-dns --config config.js

or git clone..

      git clone http://github.com/bnfinet/docker-dns
    cd docker-dns
    cp ./config/config.js.example ./config/config.js
    (edit some stuff)
    ./bin/docker-dns.js
    
or just run a docker instance

	git clone https://github.com/bnfinet/docker-dns.git
	cd docker-dns/docker
    cp ../config/config.js.example ./config/config.js
    (edit some stuff)
    cd docker;
    ./build_docker.sh;
    ./run_docker.sh hostname ./config/config.js;

## the SRV use case

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
want to have to go lookup the port mapping and wire things up.  This is called
service discovery and there's a [DNS record](http://en.wikipedia.org/wiki/SRV_record) for that.

	you@server:~$ host -t SRV _ssh._tcp.awesomeapp.dockerA.tld
	awesomeapp.docker.tld has SRV record 0 10 49158 fbc938bbfec1.dockerA.tld.

Where port 49158 is the docker side published port for ssh

Then you can do things like...

	PORT=$(host -t SRV awesomeapp.docker.tld | awk '{print $7}');
	ssh -p $PORT awesomeapp.dockerA.tld

Alternatively you can provide just the host to get all srv records for that container

	you@server:~$ host -t SRV awesomeapp.dockerA.tld
	awesomeapp.dockerA.tld has SRV record 0 10 49175 fbc938bbfec1.dockerA.tld.
	awesomeapp.dockerA.tld has SRV record 0 10 49176 fbc938bbfec1.dockerA.tld.

That doesn't tell you which services are running but it at least shows you the ports for that container.

For that you can use wild card searches...

	you@server:~$ host -t SRV _redis.*.dockerA.tld
	_redis.*.dockerA.tld has SRV record 0 10 49188 fbc938bbfec1.dockerA.tld.
	_redis.*.dockerA.tld has SRV record 0 10 49189 7d6d9f0468b8.dockerA.tld.

And since you can configure service discovery for multiple Docker environments you can do

	you@server:~$ host -t SRV _redis.*.tld
	_redis.*.tld has SRV record 0 10 49188 fbc938bbfec1.dockerA.tld.
	_redis.*.tld has SRV record 0 10 49189 7d6d9f0468b8.dockerA.tld.
	_redis.*.tld has SRV record 0 10 49199 4087bee527c5.dockerB.tld.
	_redis.*.tld has SRV record 0 10 49201 95c7e60213ac.dockerB.tld.

In addition there are two namespace, 'public' and 'local'.  The public side always points at
the assigned port from Docker.  The local side points at the port attached to the containers ip

	you@server:~$ host -t SRV _ssh.*.tld
	_ssh.*.tld has SRV record 0 10 49188 fbc938bbfec1.dockerA.tld.
	_ssh.*.tld has SRV record 0 10 49189 7d6d9f0468b8.dockerA.tld.
	_ssh.*.tld has SRV record 0 10 22 fbc938bbfec1.local.dockerA.tld.
	_ssh.*.tld has SRV record 0 10 22 7d6d9f0468b8.local.dockerA.tld.

Namespace mappings for tld, public and local are set in the conf file.


## how we do that

for each configured docker environment... 
docker-dns scans the docker api periodically and builds DNS records
for each container...
- UUID is an A record
- container ID (first 12 of the UUID) is an A record
- a cleaned version of the image name is CNAME to the A record
- hostname (run -h) is CNAME to the A record

and for all exposed ports on each container several SRV records are created by looking up the container side 'port/protocol' (such as '22/tcp') in the style of /etc/services:

````
	_service._protocol.hostname.dockerA.tld
	_service._protocol.containerID.dockerA.tld
	_service._protocol.imagename.dockerA.tld
````

## features

- supports a custom fake top level domain such as 'local' or 'docker.tld'
- supports multiple docker instances each with their own namespace (see the config)
- supports separate 'local' namespace for routing of 172.17.0.0 addresses
- maps '0.0.0.0' to a configured (possibly public) ip address

## config

Copy the config file and edit.  See documentation in the comments there.

	cp ./config/config.js.example ./config/config.js


## issues and bugs

on github please....
https://github.com/bnfinet/docker-dns/issues

## next steps
- use Docker's event stream instead of polling
- use a temporary name space for record creation
