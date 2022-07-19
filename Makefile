# Useful variables:
# gitroot	Full path of the top folder in the git checkout
# repo		Last element of the git root folder path
# PROJECT_NAME	Defaults to `repo` but override to use a different name for pyenv, docker container etc.
# project	Relative path to the project folder within the git checkout.
# python_version	Base Python version for venv
# packages	Names of Python package folders (excluding migrations/ if it exists)

gitroot = ${shell git rev-parse --show-toplevel}
repo = ${notdir ${gitroot}}
PROJECT_NAME ?= ${repo}
project = ${dir ${shell git ls-files --full-name ${firstword ${MAKEFILE_LIST}}}}

.DEFAULT_GOAL := help

# Some additional targets are available only when particular configuration files are present in the source tree.
# By conditionally including them from another file `make help` won't see them in projects where they don't apply
ifneq (,$(wildcard Dockerfile))
	MAKEFILE_INCLUDES += ${COMMON_MAKEFILE_DIR}Makefile.docker
endif
ifneq (,$(wildcard docker-compose.yml))
	MAKEFILE_INCLUDES += ${COMMON_MAKEFILE_DIR}Makefile.docker-compose
endif

-include ${MAKEFILE_INCLUDES}

.PHONY: help install docker-build docker-run docker-stop test run

help:    ## Show this help.
	+@printf "Usage:\n\tmake [options] target ...\n\nTargets:\n"
	+@echo "$$(grep -hE '^\S+:.*##' $(MAKEFILE_LIST) | sort | sed -e 's/:.*##\s*/:/' -e 's/\(.*\):\(.*\)/\\x1b[36m\1\\x1b[m:\2/' | column -c2 -t -s :)"


install: ## pip install required packages.
install:  node_modules

clean:   ## Remove node packages
clean:
	rm -rf node_modules

# Pre-commit hooks. Targets only installed if there is a pre-commit configuration.
ifneq (,$(wildcard .pre-commit-config.yaml))

.git/hooks/pre-commit: .pre-commit-config.yaml
	pre-commit install

install: .git/hooks/pre-commit
endif

docker-build: ## Build docker container
	docker build -t ${PROJECT_NAME} --build-arg CUSTOM_PYPI_URL=${CUSTOM_PYPI_URL} .

docker-run: ## Run service and dependencies with docker-compose
	docker-compose up

docker-stop: ## Stop running containers
	docker-compose down

lint:	## Lint the code (eslint)
lint: install
	yarn lint

test:	## Run unit tests
test: install
	yarn test

run:	## Run locally
run: install
	yarn start

node_modules: package.json yarn.lock
	yarn install
