'use strict'

const promisify = require('promisify-es6')
const every = require('async/every')
const each = require('async/each')
const bsplit = require('buffer-split')

module.exports = (self) => {
  return {
    /**
     * Find the closest peers to a given `PeerId`, by querying the DHT.
     *
     * @param {PeerId} peer - The `PeerId` to run the query agains.
     * @param {function(Error, Array<PeerId>)} [callback]
     * @returns {Promise<Array<PeerId>>|void}
     */
    query: promisify((peer, callback) => {
      self.libp2p.dht.getClosestPeers(peer.id, callback)
    }),
    /**
     * Find peers in the DHT that can provide a specific value, given a key.
     *
     * @param {CID} key - They key to find providers for.
     * @param {function(Error, Array<PeerInfo>)} [callback]
     * @returns {Promise<PeerInfo>|void}
     */
    findprovs: promisify((key, callback) => {
      self.libp2p.dht.findProviders(key, callback)
    }),
    /**
     * Query the dHT for all multiaddresses associated with a `PeerId`.
     *
     * @param {PeerId} peer - The id of the peer to search for.
     * @param {function(Error, Array<Multiaddr>)} [callback]
     * @returns {Promise<Array<Multiaddr>>|void}
     */
    findpeer: promisify((peer, callback) => {
      self.libp2p.dht.findPeer(peer, (err, info) => {
        if (err) {
          return callback(err)
        }
        callback(null, info.multiaddrs.toArray())
      })
    }),
    /**
     * Given a key, query the DHT for its best value.
     *
     * @param {Buffer} key
     * @param {function(Error)} [callback]
     * @returns {Promise|void}
     */
    get: promisify((key, callback) => {
      self.libp2p.dht.get(key, callback)
    }),
    /**
     * Write a key/value pair to the DHT.
     *
     * Given a key of the form /foo/bar and a value of any
     * form, this will write that value to the DHT with
     * that key.
     *
     * @param {Buffer} key
     * @param {Buffer} value
     * @param {function(Error)} [callback]
     * @returns {Promise|void}
     */
    put: promisify((key, value, callback) => {
      self.libp2p.dht.put(key, value, callback)
    }),
    /**
     * Announce to the network that we are providing given values.
     *
     * @param {CID|Array<CID>} keys - The keys that should be announced.
     * @param {Object} [options={}]
     * @param {bool} [options.recursive=false] - Provide not only the given object but also all objects linked from it.
     * @param {function(Error)} [callback]
     * @returns {Promise|void}
     */
    provide: promisify((keys, options, callback) => {
      if (!Array.isArray(keys)) {
        keys = [keys]
      }
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      // ensure blocks are actually local
      every(keys, (key, cb) => {
        self.repo.blockstore.has(key, cb)
      }, (err, has) => {
        if (err) {
          return callback(err)
        }
        if (!has) {
          return callback(new Error('Not all blocks exist locally, can not provide'))
        }

        if (options.recursive) {
          // TODO: Implement recursive providing
        } else {
          each(cids, (cid, cb) => {
            self.libp2p.dht.provide(cid, cb)
          }, callback)
        }
      })
    })
  }
}
