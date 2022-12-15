# MINA DECENTRALIZED PRICE FEED ORACLE API

This API is basically a hybrid app that serves as a user endpoint and price feed node.

During the initialization, API creates a p2p node and connects to one peer. After setting up the other components like redis, express app starts to serve.

Every 10 seconds, nodes shares their neighbours with the current neighbours, this is basically a discovery for not-connected nodes. It is not the best solution, but works for PoC.

After the initialization, endpoint from an any node will return the current BTC price with timestamped and signed by every single node.

The result can be directly use in MINA zkApp, which is demoed on its own repo.

## Development Notes:
For demo purposes, we containerized the API and composed them.

Please run

    docker-compose up

inside this folder. It will bootstrap 5 nodes, discover each other, and get ready to serve.

---

Then you can call `http://localhost:3000` to get the latest price feed.
* Note: For development, please give ~30 seconds to bootstrap correctly.