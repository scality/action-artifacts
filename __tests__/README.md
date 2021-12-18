# How to run the tests

Describing how to run the tests locally

## Setup

Build all required docker images
```shell
export ARTIFACTS_REPO=~/path/to/artifacts/repo

docker build -t artifacts:latest $ARTIFACTS_REPO
docker build -t fake-github:latest $ARTIFACTS_REPO/tests/github-fake-config
```

Run all required docker images:

```shell
# cloudserver
docker run -d --rm --name cloudserver --env REMOTE_MANAGEMENT_DISABLE=1 --env LOG_LEVEL=debug --env ENDPOINT="cloudserver-front" zenko/cloudserver:8.1.2
# fake github api
docker run -d --rm --name fake-github fake-github
# artifacts
docker run -it --rm --name artifacts --link=cloudserver:cloudserver-front --env-file=$ARTIFACTS_REPO/tests/.env --link=fake-github:fake-github-url -p 8080:80 artifacts
```

Create s3 buckets

```shell
docker run -it --rm --link=cloudserver:cloudserver-front --env AWS_SECRET_ACCESS_KEY=verySecretKey1 --env AWS_ACCESS_KEY_ID=accessKey1 amazon/aws-cli s3 --endpoint=http://cloudserver-front:8000 mb s3://artifacts-staging/ --region us-east-1
docker run -it --rm --link=cloudserver:cloudserver-front --env AWS_SECRET_ACCESS_KEY=verySecretKey1 --env AWS_ACCESS_KEY_ID=accessKey1 amazon/aws-cli s3 --endpoint=http://cloudserver-front:8000 mb s3://artifacts-prolonged/ --region us-east-1
docker run -it --rm --link=cloudserver:cloudserver-front --env AWS_SECRET_ACCESS_KEY=verySecretKey1 --env AWS_ACCESS_KEY_ID=accessKey1 amazon/aws-cli s3 --endpoint=http://cloudserver-front:8000 mb s3://artifacts-promoted/ --region us-east-1
```

Run node environment
```shell
export ACTION_REPO=/path/to/action-artifacts/repo
docker run -it --rm --link=artifacts:artifacts -v $ACTION_REPO:/shared --env INPUT_URL=http://artifacts --env INPUT_USER=username-pass --env INPUT_PASSWORD=pass node:16 bash
cd /shared
# Run it all
yarn run all
```
