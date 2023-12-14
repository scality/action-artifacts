# Contributing

Contributions are welcome and appreciated.

Below you will find the guidelines for contributing to this project.

## Getting Started

For easier development setup, we recommend using Codespaces.
To get started, click the button below:

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/scality/action-artifacts)

## Testing

Required services for the tests to run can be started thanks to docker compose:
```shell
docker compose up -d
```

Then you can run the tests:
```shell
# Run suite of all tests/linters
yarn run all
# Run only tests
yarn run test
```

## Pull Request Process

As this is a typescript GitHub Action, once the code is ready
it is required to build and package the code accordingly.

The command above will generate a `dist` folder that will be used
by the GitHub Action.

```shell
# build and package
yarn run build
yarn run package
# commit the dist folder
git add dist
git commit
# push the changes
git push
```

