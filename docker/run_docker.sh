#!/bin/bash

DOCKERBRIDGEIP=$(ip addr show dev docker0 | awk -F'[ /]*' '/inet /{print $3}');

function usage {
    cat <<EOF
    $0 hostname ./path/to/config.js [ 172.17.42.1:53 ] [ logging ]

    runs the docker-dns container with mappings
    by default the dns services bind to the ip assigned to docker0 AND 127.0.0.1
    note that ./path/to/config.js MUST be relative
    the config file will be mapped into the container
EOF
}

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
HOST=$1

if [[ "${HOST}" = "" ]]; then
	HOST="127.0.0.1"
fi

CONF=$2
CONFARG="";

if [[ ! "${CONF}" = "" ]]; then
    echo "using config file ${CONF}";
    CONFARG=" -v ${PWD}/${CONF}:/opt/docker-dns/config/config.js ";
fi

BINDIPPORT=$3
BINDARG=""

if [[ ! "${BINDIPPORT}" = "" ]]; then
    BINDARG=" -p ${BINDIPPORT}:53/udp ";
    echo "set binding ip:port to ${BINDARG}";
else
    BINDARG=" -p $DOCKERBRIDGEIP:53:53/udp -p 127.0.0.1:53:53/udp ";
fi

LOG=$4
LOGARG=""

if [[ ! "${LOG}" = "logging" ]]; then
    LOAGARG=" -v ${PWD}/log:/var/log/supervisor "
fi

docker stop docker-dns;
docker rm docker-dns;

sleep 3;

CMD="sudo docker run -d -t -h ${HOST} --name docker-dns ${BINDARG} -v /var/run/docker.sock:/var/run/docker.sock ${LOGARG} ${CONFARG} docker-dns ";

echo $CMD;
UUID=$($CMD);


cat <<EOF
    try this out to test if it worked:

       dig -t SRV \* @$DOCKERBRIDGEIP
       dig -t SRV _domain._udp\* @$DOCKERBRIDGEIP

    logs are available at ./log/docker-dns.log

    please send pulls and patches, especially to update
    the config/etc-services file

EOF
