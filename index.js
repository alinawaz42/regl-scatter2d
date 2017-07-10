'use strict'

const createRegl = require('regl')
const extend = require('object-assign')
const rgba = require('color-rgba')
const getBounds = require('array-bounds')
const clamp = require('clamp')
const atlas = require('font-atlas-sdf')
const colorId = require('color-id')
const normalize = require('array-normalize')

module.exports = createScatter

function createScatter (options) {
  if (!options) options = {}

  // persistent variables
  let regl, gl, canvas, plot,
      view, size, bounds, shape,
      pointTexture, ids, idBuffer

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

  // compatibility
  gl = regl._gl
  canvas = gl.canvas

  // this texture keeps params of every point
  pointTexture = regl.texture({
    format: 'rgba',
    type: 'uint8',
    mipmap: true,
    min: 'linear mipmap nearest',
    mag: 'nearest',
    wrap: 'clamp'
  })

  // buffer with upgoing ids
  ids = new Float32Array(4096*4096)
  for (let i = 0, l = ids.length; i < l; i++) {
    ids[i] = i
  }
  idBuffer = regl.buffer({
    usage: 'static',
    type: 'float',
    data: ids
  })

  update(options)

  // draw texture shader
  let draw = regl({
    vert: `
      precision highp float;

      uniform vec2 shape;
      uniform vec2 screen;
      uniform vec4 bounds;
      uniform vec4 view;
      uniform sampler2D points;

      attribute float id;

      void main () {
        float x = mod(id, screen.x) + .5;
        float y = floor(id / screen.x) + .5;

        vec2 brange = vec2(bounds.z - bounds.x, bounds.w - bounds.y);
        vec2 vrange = vec2(view.z - view.x, view.w - view.y);
        vec2 normxy = vec2(x / screen.x, y / screen.y);
        vec2 dataxy = normxy * vrange + view.xy;
        vec2 textxy = (dataxy - bounds.xy) / brange;

        // FIXME: make more elegant
        if (textxy.x > 1. || textxy.x < 0. || textxy.y > 1. || textxy.y < 0.) return;

        vec4 point = texture2D(points, textxy);

        if (point.z == 0.) return;

        vec2 viewxy = normxy;// + point.xy / 255.;

        gl_Position = vec4(viewxy * 2. - 1., 0, 1);

        gl_PointSize = 1.;
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
      shape: () => shape,
      points: pointTexture,

      bounds: () => bounds,
      view: () => view,

      //FIXME: pass real screen coords
      screen: param => [param.viewportWidth, param.viewportHeight],
    },
    //FIXME: there should be as many pts here as many screen points
    count: param => param.viewportWidth*param.viewportHeight,
    primitive: 'points'
  })


  return redraw


  function redraw(opts) {
    if (opts) update(opts)

    // TODO: make multipass-render here for border types

    draw()
  }

  // take over options
  function update(opts) {
    let w = canvas.width, h = canvas.height

    if (options.length != null) options = {positions: options}

    // provide data view box
    if (options.view) {
      view = options.view
    }

    if (options.size) size = options.size

    // update positions
    if (options.positions != null) {
      let positions = new Float32Array(options.positions);

      let pointCount = Math.floor(positions.length / 2)

      bounds = getBounds(positions, 2)

      // texture with points
      // let dim = Math.ceil(Math.log2(Math.sqrt(positions.length/2)))
      // let radius = 2 << dim
      shape = [128, 128]

      let data = new Uint8Array(shape[0]*shape[1]*4)

      // normalize points
      let npositions = normalize(positions, 2, bounds)

      // walk all available points, snap to pixels
      for (let i = 0; i < pointCount; i++) {
        // coords
        let x = positions[i*2], y = positions[i*2+1]

        // normalized position
        let nx = npositions[i*2],
            ny = npositions[i*2+1]

        // position in texture coords
        let tx = nx * shape[0],
            ty = ny * shape[1]

        // snapped position
        let sx = Math.floor(tx),
            sy = Math.floor(ty)

        // if point exists in texture
        let idx = sx + sy * shape[0]
        let ptr = idx*4;

        // ignore already defined point
        if (data[ptr + 2] > 0) {
          data[ptr + 2]++
          continue
        }

        // put new point offsets from the expected center
        data[ptr] = 255 * (tx - sx)
        data[ptr + 1] = 255 * (ty - sy)

        // point count
        data[ptr + 2] = 1

        // size of point
        data[ptr + 3] = 10//size[idx] || size;
      }

      // update texture
      pointTexture({
        shape: shape,
        data: data
      })

      // if no view defined - use bounds as view
      if (!view) {
        view = bounds
      }
    }
  }
}
