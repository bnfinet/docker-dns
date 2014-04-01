#!/bin/bash


function usage {
    cat <<EOF

    $0 hostname ./path/to/config.js [ 172.17.42.1:53 ]

    runs the docker-dns container with mappings

    by default the dns services bind to 172.17.42.1:53

    note that ./path/to/config.js MUST be relative

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
    echo "using config file ${CONF}";
    CONFARG=" -v ${PWD}/${CONF}:/usr/lib/node_modules/docker-dns/config/config.js ";
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
    BINDARG=" -p 172.17.42.1:53:53/udp ";
fi

sudo docker stop docker-dns;
sudo docker rm docker-dns;

sleep 3;

CMD="sudo docker run -d -t -h ${HOST} --name docker-dns ${BINDARG} -v /var/run/docker.sock:/var/run/docker.sock -v ${PWD}/log:/var/log/supervisor ${CONFARG} docker-dns ";

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

#sudo docker logs $UUID
