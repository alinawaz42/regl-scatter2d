'use strict'

const createRegl = require('regl')
const extend = require('object-assign')
const rgba = require('color-rgba')
const getBounds = require('array-bounds')
const clamp = require('clamp')
const atlas = require('font-atlas-sdf')
const colorId = require('color-id')
const snapPoints = require('snap-points-2d')
const clusterPoints = require('../point-cluster')
const normalize = require('array-normalize')

module.exports = createScatter

function createScatter (options) {
  if (!options) options = {}

  //init regl
  let regl

  // regl instance
  if (options.regl) regl = options.regl

  // container/gl/canvas case
  else {
    regl = createRegl({
      pixelRatio: options.pixelRatio || window.devicePixelRatio,
      gl: options.gl,
      container: options.container,
      canvas: options.canvas,
      extensions: ['OES_texture_float'],
      optionalExtensions: ['oes_texture_float_linear']
    })
  }

  //compatibility
  let gl = regl._gl
  let canvas = gl.canvas

  //init
  let bounds = [-Infinity, -Infinity, Infinity, Infinity]

  //this texture keeps params of every point
  let pointTexture = regl.texture({
    format: 'rgba',
    type: 'float'
  })

  //buffer with upgoing ids
  let ids = new Float32Array(4096*4096)
  for (let i = 0, l = ids.length; i < l; i++) {
    ids[i] = i
  }
  let idBuffer = regl.buffer({
    usage: 'static',
    type: 'float',
    data: ids
  })

  update(options)

  // draw texture shader
  let drawTexture = regl({
    vert: `
      precision highp float;

      uniform vec2 shape;
      uniform sampler2D points;

      attribute float id;

      void main () {
        float x = mod(id, shape.x) + .5;
        float y = floor(id / shape.x) + .5;

        vec2 normCoords = vec2(x/shape.x, y/shape.y);

        vec4 point = texture2D(points, normCoords);

        if (point.x < 0.) return;

        normCoords.x += point.x;
        normCoords.y += point.y;

        gl_Position = vec4(normCoords * 2. - 1., 0, 1);

        gl_PointSize = .5;
      }
    `,
    frag: `
      void main() {
        gl_FragColor = vec4(0,0,1,1);
      }
    `,
    attributes: {
      id: {
        buffer: idBuffer
      }
    },
    uniforms: {
      shape: [256,256],
      points: pointTexture
    },
    count: 256*256,
    primitive: 'points'
  })


  return draw


  function draw(opts) {
    if (opts) update(opts)

    //TODO: make multipass-render here

    drawTexture()
    // this.drawPoints()
    // this.drawTest()
  }

  function update(opts) {
    let w = canvas.width, h = canvas.height

    if (options.length != null) options = {positions: options}

    let {
      positions,
      selection,
      scale,
      translate,
      size,
      color,
      borderSize,
      borderColor,
      glyph,
      pixelRatio,
      viewBox,
      dataBox
    } = options


    //update positions
    if (positions != null) {
      // this.positionBuffer(positions)
      let pointCount = Math.floor(positions.length / 2)

      //update bounds
      bounds = getBounds(positions, 2)

      //texture with points
      // let dim = Math.ceil(Math.log2(Math.sqrt(positions.length/2)))
      // let radius = 2 << dim
      let shape = [256, 256]

      let data = new Float32Array(Array(shape[0]*shape[1]*4).fill(-1))

      //walk all available points, snap to pixels
      let range = [bounds[2] - bounds[0], bounds[3] - bounds[1]]
      for (let i = 0; i < pointCount; i++) {
        //coords
        let x = positions[i*2], y = positions[i*2+1]

        //normalized position
        let nx = (x - bounds[0]) / range[0],
            ny = (y - bounds[1]) / range[1]

        if (nx === 1) nx -= 1e-10
        if (ny === 1) ny -= 1e-10

        //position in texture coords
        let tx = nx * shape[0],
            ty = ny * shape[1]

        //snapped position
        let sx = Math.floor(tx),
            sy = Math.floor(ty)

        //if point exists in texture
        let idx = sx + sy * shape[0]

        //ignore already defined point
        if (data[idx*4] >= 0) continue

        //put new point offsets from the expected center
        data[idx*4] = (tx - sx) / shape[0]
        data[idx*4 + 1] = (ty - sy) / shape[1]
        data[idx*4 + 2] = 0
        data[idx*4 + 3] = 0
      }

      //update texture
      pointTexture({
        shape: shape,
        data: data
      })
    }
  }
}
