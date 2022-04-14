# Action Artifacts

This repository contain a GitHub Action to interact with the [Artifacts] service.

The [Artifacts] service is responsible of storing and distributing any sort of files that was created in a CI pipeline.

## Method

This action contain different method of interacting with Artifacts. You will find below each method with their description.

### Setup

Set outputs that relate to the artifacts attached to your build. See more about the outputs below.

Example:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Retrieve my artifacts name
        id: artifacts
        uses: scality/action-artifacts@v1
        with:
          method: setup
          url: my.artifacts.url
          user: ${{ secrets.ARTIFACTS_USER }}
          password: ${{ secrets.ARTIFACTS_PASSWORD }}
      - run: |
          curl -u ${{ secrets.ARTIFACTS_USER }}:${{ secrets.ARTIFACTS_PASSWORD }}  ${{ steps.artifacts.outputs.link }}/my-file -o my-file
```

### Upload

Upload files to artifacts.

Example:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Upload files to artifacts
        id: artifacts
        uses: scality/action-artifacts@v1
        with:
          method: upload
          url: my.artifacts.url
          user: ${{ secrets.ARTIFACTS_USER }}
          password: ${{ secrets.ARTIFACTS_PASSWORD }}
          source: ./file1 ./file2 ./dir1
      - run: |
          curl -u ${{ secrets.ARTIFACTS_USER }}:${{ secrets.ARTIFACTS_PASSWORD }} ${{ steps.artifacts.outputs.link }}/file1 -o file1
```

### Promote

Artifacts can be promoted when a tag has been made to make a build available forever.

Example:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Promote artifacts by name
        id: artifacts
        uses: scality/action-artifacts@v1
        with:
          method: promote
          url: my.artifacts.url
          name: 'githost:owner:repo:staging-1628004655.8e50acc6a1.pre-merge.28'
          tag: 'promote:tag'
          user: ${{ secrets.ARTIFACTS_USER }}
          password: ${{ secrets.ARTIFACTS_PASSWORD }}
      - run: |
          curl ${{ steps.artifacts.outputs.link }}/my-file -o my-file
```

### Prolong

Artifacts have an expiration date of 15 days. The prolong method allows you to make a copy of your build that will last longer.

Example:
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Artifacts Prolong
        id: artifacts-prolong
        uses: ./
        with:
          url: my.artifacts.url
          user: ${{ secrets.ARTIFACTS_USER }}
          password: ${{ secrets.ARTIFACTS_PASSWORD }}
          name: 'githost:owner:repo:staging-1628004655.8e50acc6a1.pre-merge.28'
          method: prolong
```

### Get
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Artifacts Upload
        id: artifacts-get
        uses: ./
        with:
          url: my.artifacts.url
          user: ${{ secrets.ARTIFACTS_USER }}
          password: ${{ secrets.ARTIFACTS_PASSWORD }}
          workflow-name: test-get
          method: get
      - run: |
          curl -u ${{ secrets.ARTIFACTS_USER }}:${{ secrets.ARTIFACTS_PASSWORD }} ${{ steps.artifacts-get.outputs.link }}/file1 -o file1
```

## Inputs

This action take the following inputs:

* `url`: The url of artifacts. This input is required.
* `user`: The user to authenticate with Artifacts.
Usually setup as a secret in the organization, ask your admin for the key of it. This input is required.
* `password`: The password to authenticate the operation with Artifacts. This input is required.
* `method`: What kind of interaction you will perform with Artifacts.
With the choice of: `upload`, `promote`, `prolong` or `get`.
This input is required.
* `sources`: File or directory to upload. To be used with the `upload` method.
* `name`: The name of the artifacts build you will use. Only used with `prolong` and `promote` method.
* `tag`: The git tag name of the artifacts you are going to promote. To be used with `promote` method.
* `workflow-name`: Name of the workflow file you want to have the Artifacts name. To be used with `get` method.

## Outputs

This action will output the following variables:

* `name`: Will contain a generated name for the artifacts that will be used for a workflow. Each workflow will have a unique artifact name which can be shared among the jobs that are within.
* `link`: The full url in which artifacts will be stored.


[Artifacts]: https://github.com/scality/artifacts
