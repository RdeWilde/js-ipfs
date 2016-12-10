'use strict'

const waterfall = require('async/waterfall')
const promisify = require('promisify-es6')
const dagPB = require('ipld-dag-pb')
const DAGNode = dagPB.DAGNode
const DAGLink = dagPB.DAGLink
const CID = require('cids')
const mh = require('multihashes')

function normalizeMultihash (multihash, enc) {
  if (typeof multihash === 'string') {
    if (enc === 'base58') {
      return multihash
    }

    return new Buffer(multihash, enc)
  } else if (Buffer.isBuffer(multihash)) {
    return multihash
  } else {
    throw new Error('unsupported multihash')
  }
}

function parseBuffer (buf, encoding, callback) {
  switch (encoding) {
    case 'json':
      return parseJSONBuffer(buf, callback)
    case 'protobuf':
      return parseProtoBuffer(buf, callback)
    default:
      callback(new Error(`unkown encoding: ${encoding}`))
  }
}

function parseJSONBuffer (buf, callback) {
  let data
  let links

  try {
    const parsed = JSON.parse(buf.toString())

    links = (parsed.Links || []).map((link) => {
      return new DAGLink(
        link.Name || link.name,
        link.Size || link.size,
        mh.fromB58String(link.Hash || link.hash || link.multihash)
      )
    })
    data = new Buffer(parsed.Data)
  } catch (err) {
    return callback(new Error('failed to parse JSON: ' + err))
  }

  DAGNode.create(data, links, callback)
}

function parseProtoBuffer (buf, callback) {
  dagPB.util.deserialize(buf, callback)
}

module.exports = function object (self) {
  function editAndSave (edit) {
    return (multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      waterfall([
        (cb) => {
          self.object.get(multihash, options, cb)
        },
        (node, cb) => {
          // edit applies the edit func passed to
          // editAndSave
          edit(node, (err, node) => {
            if (err) {
              return cb(err)
            }
            self._ipldResolver.put({
              node: node,
              cid: new CID(node.multihash)
            }, (err) => {
              cb(err, node)
            })
          })
        }
      ], callback)
    }
  }

  return {
    /**
     * @alias object.new
     * @memberof IPFS#
     * @method
     * @param {function(Error)} callback
     * @returns {Promise<undefined>|undefined}
     *
     * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectnew
     */
    new: promisify((callback) => {
      DAGNode.create(new Buffer(0), (err, node) => {
        if (err) {
          return callback(err)
        }
        self._ipldResolver.put({
          node: node,
          cid: new CID(node.multihash)
        }, (err) => {
          if (err) {
            return callback(err)
          }

          callback(null, node)
        })
      })
    }),

    /**
     * @alias object.put
     * @memberof IPFS#
     * @method
     * @param {function(Error)} callback
     * @returns {Promise<undefined>|undefined}
     *
     * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectput
     */
    put: promisify((obj, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      const encoding = options.enc
      let node

      if (Buffer.isBuffer(obj)) {
        if (encoding) {
          parseBuffer(obj, encoding, (err, _node) => {
            if (err) {
              return callback(err)
            }
            node = _node
            next()
          })
          return
        } else {
          DAGNode.create(obj, (err, _node) => {
            if (err) {
              return callback(err)
            }
            node = _node
            next()
          })
        }
      } else if (obj.multihash) {
        // already a dag node
        node = obj
        next()
      } else if (typeof obj === 'object') {
        DAGNode.create(obj.Data, obj.Links, (err, _node) => {
          if (err) {
            return callback(err)
          }
          node = _node
          next()
        })
      } else {
        return callback(new Error('obj not recognized'))
      }

      function next () {
        self._ipldResolver.put({
          node: node,
          cid: new CID(node.multihash)
        }, (err) => {
          if (err) {
            return callback(err)
          }

          self.object.get(node.multihash, callback)
        })
      }
    }),

    /**
     * @alias object.get
     * @memberof IPFS#
     * @method
     * @param {function(Error)} callback
     * @returns {Promise<undefined>|undefined}
     *
     * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectget
     */
    get: promisify((multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      let mh

      try {
        mh = normalizeMultihash(multihash, options.enc)
      } catch (err) {
        return callback(err)
      }
      const cid = new CID(mh)
      self._ipldResolver.get(cid, callback)
    }),

    /**
     * @alias object.data
     * @memberof IPFS#
     * @method
     * @param {function(Error)} callback
     * @returns {Promise<undefined>|undefined}
     *
     * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectdata
     */
    data: promisify((multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      self.object.get(multihash, options, (err, node) => {
        if (err) {
          return callback(err)
        }
        callback(null, node.data)
      })
    }),

    /**
     * @alias object.links
     * @memberof IPFS#
     * @method
     * @param {function(Error)} callback
     * @returns {Promise<undefined>|undefined}
     *
     * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectlinks
     */
    links: promisify((multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      self.object.get(multihash, options, (err, node) => {
        if (err) {
          return callback(err)
        }

        callback(null, node.links)
      })
    }),

    /**
     * @alias object.stat
     * @memberof IPFS#
     * @method
     * @param {*} multihash
     * @param {Object} [options={}]
     * @param {function(Error)} callback
     * @returns {Promise<undefined>|undefined}
     *
     * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectstat
     */
    stat: promisify((multihash, options, callback) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      self.object.get(multihash, options, (err, node) => {
        if (err) {
          return callback(err)
        }

        dagPB.util.serialize(node, (err, serialized) => {
          if (err) {
            return callback(err)
          }

          const blockSize = serialized.length
          const linkLength = node.links.reduce((a, l) => a + l.size, 0)

          const nodeJSON = node.toJSON()

          callback(null, {
            Hash: nodeJSON.multihash,
            NumLinks: node.links.length,
            BlockSize: blockSize,
            LinksSize: blockSize - node.data.length,
            DataSize: node.data.length,
            CumulativeSize: blockSize + linkLength
          })
        })
      })
    }),

    patch: {
      /**
       * @alias object.patch.addLink
       * @memberof IPFS#
       * @method
       * @param {Buffer|string} multihash
       * @param {DAGLink} link
       * @param {Object}  [options={}]
       * @param {function(Error)} callback
       * @returns {Promise<undefined>|undefined}
       *
       * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectpatchaddlink
       */
      addLink (multihash, link, options, callback) {
        editAndSave((node, cb) => {
          DAGNode.addLink(node, link, cb)
        })(multihash, options, callback)
      },

      /**
       * @alias object.patch.rmLink
       * @memberof IPFS#
       * @method
       * @param {Buffer|string} multihash
       * @param {DAGLink} linkRef
       * @param {Object}  [options={}]
       * @param {function(Error)} callback
       * @returns {Promise<undefined>|undefined}
       *
       * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectpatchrmlink
       */
      rmLink (multihash, linkRef, options, callback) {
        editAndSave((node, cb) => {
          if (linkRef.constructor &&
              linkRef.constructor.name === 'DAGLink') {
            linkRef = linkRef._name
          }
          DAGNode.rmLink(node, linkRef, cb)
        })(multihash, options, callback)
      },

      /**
       * @alias object.patch.appendData
       * @memberof IPFS#
       * @method
       * @param {Buffer|string} multihash
       * @param {Object} data
       * @param {Object}  [options={}]
       * @param {function(Error)} callback
       * @returns {Promise<undefined>|undefined}
       *
       * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectpatchappenddata
       */
      appendData (multihash, data, options, callback) {
        editAndSave((node, cb) => {
          const newData = Buffer.concat([node.data, data])
          DAGNode.create(newData, node.links, cb)
        })(multihash, options, callback)
      },

      /**
       * @alias object.patch.setData
       * @memberof IPFS#
       * @method
       * @param {Buffer|string} multihash
       * @param {Object} data
       * @param {Object}  [options={}]
       * @param {function(Error)} callback
       * @returns {Promise<undefined>|undefined}
       *
       * @see https://github.com/ipfs/interface-ipfs-core/tree/master/API/object#objectpatchsetdata
       */
      setData (multihash, data, options, callback) {
        editAndSave((node, cb) => {
          DAGNode.create(data, node.links, cb)
        })(multihash, options, callback)
      }
    }
  }
}
