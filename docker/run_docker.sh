#!/bin/bash

NAME=bfoote/docker-dns
DOCKERBRIDGEIP=$(ip addr show dev docker0 | awk -F'[ /]*' '/inet /{print $3}');


function usage {
    cat <<EOF

    $0 hostname ./path/to/config.js [ ${DOCKERBRIDGEIP} ]

    runs the docker-dns container with mappings

    by default the dns services bind to the ip assigned to docker0 AND 127.0.0.1

    note that ./path/to/config.js MUST be relative

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
    echo "using config file ${CONF}";
    CONFARG=" -v ${PWD}/${CONF}:/opt/docker-dns/config/config.js ";
else
    usage;
    exit;
fi

BINDIPPORT=$3
BINDARG=""
if [ ! "${BINDIPPORT}" = "" ]
then
    BINDARG=" -p ${BINDIPPORT}:53/udp ";
    echo "set binding ip:port to ${BINDARG}";
else
    BINDARG=" -p $DOCKERBRIDGEIP:53:53/udp -p 127.0.0.1:53:53/udp ";
fi

docker stop docker-dns;
docker rm docker-dns;

sleep 3;

CMD="docker run -d -t --privileged=true -h ${HOST} --name docker-dns ${BINDARG} -v /var/run/docker.sock:/var/run/docker.sock -v ${PWD}/log:/var/log/supervisor ${CONFARG} $NAME";

echo $CMD;

UUID=$($CMD);

#echo $UUID;

cat <<EOF

    try this out to test if it worked:

       dig -t SRV \* @172.17.42.1

       dig -t SRV _domain._udp\* @172.17.42.1

    logs are available at ./log/docker-dns.log

    please send pulls and patches, especially to update
    the config/etc-services file

    Thanks!

    ben


EOF

#docker logs $UUID
