docker-dns
==========
http://github.com/bnfinet/docker-dns

nodejs app to offer dns services based on running a running docker enironment

Benjamin Foote 
http://bnf.net
ben@bnf.net 

inspired by skydock and skydns

- initializes from one lookup of the docker containers
- then attaches to event api for updates

=== features
- container ID is the A record
- hostname is CNAME to the A record
- UUID is CNAME to the A record
- exposed ports are RFC compliant SRV records

boy this is going to be fun