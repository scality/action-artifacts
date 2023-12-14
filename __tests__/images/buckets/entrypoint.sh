#!/bin/sh

echo "Creating buckets"
aws s3 mb s3://artifacts-staging/
aws s3 mb s3://artifacts-prolonged/
aws s3 mb s3://artifacts-promoted/
