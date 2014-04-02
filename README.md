# docker-dns
http://github.com/bnfinet/docker-dns

nodejs app to offer dns services based on a running docker enironment

Benjamin Foote  
http://bnf.net  
ben@bnf.net   

inspired by [skydock](https://github.com/crosbymichael/skydock) and [skydns](https://github.com/skynetservices/skydns)

[![NPM version](https://badge.fury.io/js/docker-dns.png)](http://badge.fury.io/js/docker-dns)
[![Dependency Status](https://david-dm.org/bnfinet/docker-dns.png)](https://david-dm.org/bnfinet/docker-dns)

## installation

    npm install docker-dns
    cp ./config/config.js.example ./config/config.js
    (edit some stuff)
    ./bin/docker-dns.js
    
or just run a docker instance

	git clone https://github.com/bnfinet/docker-dns.git
	cd docker-dns
    cp ./config/config.js.example ./docker/config/config.js
    (edit some stuff)
    cd docker;
    ./build_docker.sh;
    ./run_docker.sh hostname ./config/config.js;


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

	you@laptop:~$ host -t SRV _ssh._tcp.awesomeapp.dockerA.tld
	awesomeapp.docker.tld has SRV record 0 10 49158 fbc938bbfec1.dockerA.tld.

Where port 49158 is the docker side published port for ssh

Then you can do things like...

	PORT=$(host -t SRV awesomeapp.docker.tld | awk '{print $7}');
	ssh -p $PORT awesomeapp.dockerA.tld

Alternatively you can provide just the host to get all srv records for that container

	you@laptop:~$ host -t SRV awesomeapp.dockerA.tld
	awesomeapp.dockerA.tld has SRV record 0 10 49175 fbc938bbfec1.dockerA.tld.
	awesomeapp.dockerA.tld has SRV record 0 10 49176 fbc938bbfec1.dockerA.tld.

That doesn't tell you which services are running but it at least shows you the ports for that container.

For that you can use wild card searches...

	you@laptop:~$ host -t SRV _redis.*.dockerA.tld
	_redis.*.dockerA.tld has SRV record 0 10 49188 fbc938bbfec1.dockerA.tld.
	_redis.*.dockerA.tld has SRV record 0 10 49189 7d6d9f0468b8.dockerA.tld.

And since you can configure service discovery for multiple Docker environments you can do

	you@laptop:~$ host -t SRV _redis.*.tld
	_redis.*.tld has SRV record 0 10 49188 fbc938bbfec1.dockerA.tld.
	_redis.*.tld has SRV record 0 10 49189 7d6d9f0468b8.dockerA.tld.
	_redis.*.tld has SRV record 0 10 49199 4087bee527c5.dockerB.tld.
	_redis.*.tld has SRV record 0 10 49201 95c7e60213ac.dockerB.tld.

In addition there are two namespace, 'public' and 'local'.  The public side always points at
the assigned port from Docker.  The local side points at the port atthached to the conatiner's ip

	you@laptop:~$ host -t SRV _ssh.*.tld
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
- ipv6 AAAA records
- use Docker's event stream instead of polling
- use a temporary name space for record creation
