#!/bin/bash

IMAGE=$1
HOST=$2

	function usage {
    cat <<EOF

    $0 imagename hostname

	runs the docker-dns container 

	assumes you've built the docker dns with the name 'docker-dns':

		sudo docker build -rm -t docker-dns .

EOF
}
if [ "${IMAGE}" = "" | "${HOST}" = "" ]
then
	usage;
	exit;
fi


UUID=$(sudo docker run -i -d -t -h ${HOST} --name docker-dns -p 53/udp -p 22 -v /var/run/docker.sock:/var/run/docker.sock ${IMAGE})

sudo docker logs $UUID
