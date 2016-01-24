/* @ flow */
'use strict'
const fs = require('fs')
const Geojson = require('./geojson')
const _ = require('highland')
const EventEmitter = require('events').EventEmitter
const util = require('util')
const lodash = require('lodash')

function createStream (options) {
  const size = options.size || 5000

  const output = _.pipeline(stream => {
    const watcher = new Watcher()
    let first = true
    let index = 0
    return stream
    .splitBy(',{')
    .map(filter)
    .batch(size)
    .consume((err, batch, push, next) => {
      if (err) push(err)
      if (batch === _.nil) {
        if (watcher.idle) return finish(push)
        else return watcher.on('idle', () => finish(push))
      }
      if (first) {
        push(null, '<OGRVRTDataSource>')
        first = false
        let properties
        try {
          properties = sample(batch)
        } catch (e) {
          output.emit('log', {level: 'error', message: {error: 'Bad batch of geojson', batch}})
          output.emit('error', e)
          return output.destroy()
        }
        output.emit('properties', properties)
      }
      const fileName = `${options.path}/part.${index}.json`
      push(null, addMetadata(fileName))
      const writer = writeLayer(batch, fileName)
      watcher.watch(writer)
      index++
      next()
    })
  })
  return output
}

function finish (push) {
  push(null, '</OGRVRTDataSource>')
  push(null, _.nil)
}

function sample (batch) {
  let sample = lodash.find(f => {
    const feature = JSON.parse(f)
    if (feature.geometry && feature.geometry.type) return true
    else return false
  })
  sample = JSON.parse(sample || batch[0])
  const geometry = sample.geometry ? sample.geometry.type : 'NONE'
  const fields = Object.keys(sample.properties)
  return {geometry, fields}
}

function filter (string) {
  // strip off characters if this is the first geojson feature
  const parts = string.split('"features":[{')
  // handle the case where this is the last
  return `{${parts[parts.length - 1]}`.replace(/^\{\s?\{/, '{').replace(/]\s?}\s?}\s?]\s?}/, ']}}')
}

function addMetadata (fileName) {
  return `<OGRVRTLayer name="OGRGeoJSON"><SrcDataSource>${fileName}</SrcDataSource></OGRVRTLayer>`
}

function writeLayer (batch, fileName) {
  const fileStream = fs.createWriteStream(fileName)
  return _(batch)
  .pipe(Geojson.createStream())
  .pipe(fileStream)
}

// This object's job is to make sure that we don't close the stream until
// all the vrt parts have been fully written to disk
function Watcher () {
  this.writers = []
}
util.inherits(Watcher, EventEmitter)

Watcher.prototype.watch = function (writer) {
  this.writers.push(false)
  const index = this.writers.length - 1
  writer.on('finish', () => {
    this.writers[index] = true
    // this will emit finish when all the outstanding writers come back
    if (this.writers.indexOf(false) < 0) {
      this.idle = true
      this.emit('idle')
    }
  })
}

module.exports = {createStream}
