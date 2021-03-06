precision highp float;

attribute float x, y, xFract, yFract;
attribute float size, borderSize;
attribute vec4 colorId, borderColorId;
attribute float isActive;

uniform vec2 scale, scaleFract, translate, translateFract;
uniform float pixelRatio;
uniform sampler2D palette;
uniform vec2 paletteSize;

const float maxSize = 100.;

varying vec4 fragColor, fragBorderColor;
varying float fragBorderRadius, fragWidth;

vec2 paletteCoord(float id) {
  return vec2(
    (mod(id, paletteSize.x) + .5) / paletteSize.x,
    (floor(id / paletteSize.x) + .5) / paletteSize.y
  );
}
vec2 paletteCoord(vec2 id) {
  return vec2(
    (id.x + .5) / paletteSize.x,
    (id.y + .5) / paletteSize.y
  );
}

vec4 getColor(vec4 id) {
  // zero-palette means we deal with direct buffer
  if (paletteSize.x == 0.) return id / 255.;
  return texture2D(palette, paletteCoord(id.xy));
}

void main() {
  // ignore inactive points
  if (isActive == 0.) return;

  vec2 position = vec2(x, y);
  vec2 positionFract = vec2(xFract, yFract);

  vec4 color = getColor(colorId);
  vec4 borderColor = getColor(borderColorId);

  float size = size * maxSize / 255.;
  float borderSize = borderSize * maxSize / 255.;

  gl_PointSize = (size + borderSize) * pixelRatio;

  vec2 pos = (position + translate) * scale
      + (positionFract + translateFract) * scale
      + (position + translate) * scaleFract
      + (positionFract + translateFract) * scaleFract;

  gl_Position = vec4(pos * 2. - 1., 0, 1);

  fragBorderRadius = 1. - 2. * borderSize / (size + borderSize);
  fragColor = color;
  fragBorderColor = borderColor.a == 0. || borderSize == 0. ? vec4(color.rgb, 0.) : borderColor;
  fragWidth = 1. / gl_PointSize;
}
