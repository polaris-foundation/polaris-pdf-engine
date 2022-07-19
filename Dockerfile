#####
# Build the common base
#####
FROM node:13.1-slim as basebuilder

RUN apt update -y && apt upgrade -y

WORKDIR /app

# Upgrade to latest npm
RUN npm i npm@latest -g

# Add deps
COPY package.json yarn.lock tsconfig.json ./
RUN yarn install --production --frozen-lockfile

#####
# Generate production code and check it
#####

FROM basebuilder as sourcetransformer

## Install dev dependencies
RUN yarn install --frozen-lockfile

# Add source files
COPY . ./

# Lint source and fail on error
RUN yarn lint

# Audit and fail on vuln
# TODO: Currently fails because of static-eval advisory. https://www.npmjs.com/advisories/758
# RUN yarn audit

# Run tests on dist/ and fail on...failure
RUN yarn test


#####
# Configure basebuilder for production
#####
FROM basebuilder as runner

# Copy dist files from sourcetransformer
COPY --from=sourcetransformer /app/src src/
COPY --from=sourcetransformer /app/package.json .
COPY --from=sourcetransformer /app/config config/

# Set expressjs to production mode
# https://expressjs.com/en/advanced/best-practice-performance.html#set-node_env-to-production
ENV NODE_ENV=production

EXPOSE 3000

# node user owns /app
RUN chown -R node /app

## Run as low privilege user
## https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#non-root-user
USER node

ENTRYPOINT ["yarn", "start"]
