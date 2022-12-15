FROM node:16

EXPOSE 3000 3000

COPY package.json package-lock.json* yarn.lock ./

RUN yarn install --ignore-optional && yarn cache clean --force

# copy in our source code last, as it changes the most
WORKDIR /src

COPY . .

ENTRYPOINT ["yarn", "run"]