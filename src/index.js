/* @ flow */
'use strict'
const VRT = require('./lib/vrt')
const OGR = require('./lib/ogr')
const random = require('randomstring')
const rimraf = require('rimraf')
const _ = require('highland')
const mkdirp = require('mkdirp')

function createStream (format, options) {
  options = options || {}
  options.path = `${options.path || '.'}/${random.generate()}`
  mkdirp.sync(options.path)
  const output = _.pipeline(stream => {
    const ogrStream = OGR.createStream(format, options)
    return stream
    .pipe(VRT.createStream(options))
    .on('log', l => output.emit('log', l))
    .on('error', e => {
      output.emit('error', e)
      cleanup(output, options.path)
    })
    .on('properties', p => ogrStream.emit('properties', p))
    .pipe(ogrStream)
    .on('log', l => output.emit('log', l))
    .on('error', e => {
      output.emit('error', e)
      cleanup(output, options.path)
    })
    .on('end', () => cleanup(output, options.path))
  })

  return output
}

function cleanup (stream, path) {
  rimraf(path, err => {
    if (err) stream.emit('log', {level: 'error', message: 'Failed to delete temporary directory'})
    stream.destroy()
  })
}

module.exports = {
  GeoJSON: require('./lib/geojson'),
  OGR,
  VRT,
  createStream
}
