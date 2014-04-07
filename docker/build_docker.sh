#!/bin/bash

if [ ! -e ./config/config.js ]
then
    cat <<EOF

  you should have a config file in place before you build and run your docker image

  ${PWD}/config/config.js
  
  see
  https://github.com/bnfinet/docker-dns/blob/master/config/config.js.example

EOF

 exit;
fi

sudo docker rmi docker-dns
sudo docker build --no-cache --rm -t docker-dns .
