#!/bin/bash


function usage {
    cat <<EOF

    $0 hostname /path/to/config.js [ 172.17.42.1:53 ]

    runs the docker-dns container with mappings

    by default the dns services bind to 172.17.42.1:53

    assumes you've built the docker dns with the name 'docker-dns':

        sudo docker build -rm -t docker-dns .

    if you provide a config file it will be mapped into the proper place at run time

EOF

}

HOST=$1

if [ "${HOST}" = "" ];
then
	usage;
	exit;
fi

CONF=$2
CONFARG="";
if [ ! "${CONF}" = "" ]
then
    CONFARG=" -v ${CONF}:/usr/lib/node_modules/docker-dns/config/config.js ";
else
    usage;
    exit;
fi

BINDIPPORT=$3
BINDARG=""
if [ ! "${BINDPORT}" = "" ]
then
    BINDARG=" -p ${BINDPORT}:53/udp ";
else
    BINDARG=" -p 172.17.42.1:53:53/udp ";
fi



sudo docker stop docker-dns;
sudo docker rm docker-dns;


CMD="sudo docker run -i -d -t -h ${HOST} --name docker-dns ${BINDARG} -v /var/run/docker.sock:/var/run/docker.sock ${CONFARG} docker-dns";

echo $CMD;

UUID=$($CMD);

sudo docker logs $UUID
