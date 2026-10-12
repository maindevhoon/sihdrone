import { Cartesian3, Color, PostProcessStage } from 'cesium';
import { lightingOf } from './environment';
import type { Scenario } from './simulation';

/** Simulated illumination and depth haze over daytime imagery, also usable with baked 3D tiles. */
export function earthEnvironmentStage(scenario: Scenario) {
  const night = lightingOf(scenario) === 'night';
  return new PostProcessStage({
    name: 'trinetra-environment',
    fragmentShader: `
      uniform sampler2D colorTexture;
      uniform sampler2D depthTexture;
      uniform vec3 tint;
      uniform vec3 fogColor;
      uniform float fogDensity;
      in vec2 v_textureCoordinates;
      void main() {
        vec4 color = texture(colorTexture, v_textureCoordinates);
        float depth = czm_readDepth(depthTexture, v_textureCoordinates);
        vec4 eye = czm_inverseProjection * vec4(v_textureCoordinates * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        float range = length(eye.xyz / eye.w);
        float haze = depth >= 1.0 ? 0.75 : 1.0 - exp(-pow(range * fogDensity, 2.0));
        color.rgb *= tint;
        color.rgb = mix(color.rgb, fogColor, fogDensity > 0.0 ? haze : 0.0);
        out_FragColor = color;
      }`,
    uniforms: {
      tint: night ? new Cartesian3(.24, .32, .46) : new Cartesian3(1, 1, 1),
      fogColor: night ? Color.fromCssColorString('#182636') : Color.fromCssColorString('#b8bdba'),
      fogDensity: scenario.fog ? .00065 : 0,
    },
  });
}
