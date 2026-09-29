// The sun's shadow: one directional light whose shadow box follows the player along the street, snapped to
// shadow-map texels so edges don't crawl, and a PCSS filter (blocker search → penumbra from blocker
// distance) patched into three's basic shadow lookup: sharp at the foot of a palm trunk, soft at the tip of
// its 100 m shadow. The box is long and flat because at 7° the light is almost horizontal: it spans the
// whole cross-section from the hotel roofs to the surf, and `shadowLength` metres of street.
import { BasicShadowMap, DirectionalLight, Object3D, OrthographicCamera, ShaderChunk, Vector3, type WebGLRenderer } from 'three';
import type { Quality } from '../quality';
import { SUN_DIR } from '../sky/atmosphere';

/** height of the box across the light (m): ground at the surf up to the tallest roofs */
const BOX_H = 104;
/** along the light (m) */
const BOX_D = 1500;
/** effective angular size of the sun for penumbrae (a little over 0.53°, the haze widens it) */
const SUN_ANGLE = 0.011;
const PEN_MAX = 1.1;

const f = (v: number) => v.toPrecision(7);

export function installShadows(renderer: WebGLRenderer, q: Quality): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = BasicShadowMap; // raw depth texture: the PCSS below does its own filtering
  const W = q.shadowLength;
  const S = q.shadowMapSize;
  const texel = Math.max(W, BOX_H) / S;
  const penMin = Math.max(1.6 * texel, 0.02);

  const pcss = /* glsl */ `
	float odIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 odVogel( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float th = float( i ) * 2.399963229728653 + phi;
		return vec2( cos( th ), sin( th ) ) * r;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		// receiver-plane depth bias: the depth slope of this surface in shadow-map space, so wide kernels on
		// grazing receivers (the whole ground, at 7°) don't shadow themselves
		vec3 sdx = dFdx( shadowCoord.xyz );
		vec3 sdy = dFdy( shadowCoord.xyz );
		float det = sdx.x * sdy.y - sdx.y * sdy.x;
		vec2 dz = abs( det ) > 1e-14 ? vec2( sdy.y * sdx.z - sdx.y * sdy.z, sdx.x * sdy.z - sdy.x * sdx.z ) / det : vec2( 0.0 );
		dz = clamp( dz, vec2( -${f(40 / BOX_D)} ), vec2( ${f(40 / BOX_D)} ) );
		vec2 uv = shadowCoord.xy;
		float edge = min( min( uv.x, 1.0 - uv.x ), min( uv.y, 1.0 - uv.y ) );
		if ( edge <= 0.0 || shadowCoord.z > 1.0 ) return 1.0;
		const vec2 EXT = vec2( ${f(W)}, ${f(BOX_H)} );
		float zr = shadowCoord.z;
		float phi = odIGN( gl_FragCoord.xy ) * 6.28318530718;
		// 1. blockers
		vec2 searchUV = vec2( ${f(PEN_MAX * 0.5)} ) / EXT;
		float bsum = 0.0;
		float bcnt = 0.0;
		for ( int i = 0; i < ${q.pcssSearch}; i ++ ) {
			vec2 o = odVogel( i, ${q.pcssSearch}, phi ) * searchUV;
			float d = texture2D( shadowMap, uv + o ).r;
			float zc = zr + dot( dz, o ) - ${f(0.02 / BOX_D)};
			if ( d < zc ) { bsum += d; bcnt += 1.0; }
		}
		if ( bcnt < 0.5 ) return 1.0;
		float dist = max( zr - bsum / bcnt, 0.0 ) * ${f(BOX_D)};
		float pen = clamp( dist * ${f(SUN_ANGLE)}, ${f(penMin)}, ${f(PEN_MAX)} );
		// 2. filter over the penumbra
		vec2 fUV = vec2( pen * 0.5 ) / EXT;
		float lit = 0.0;
		for ( int i = 0; i < ${q.pcssFilter}; i ++ ) {
			vec2 o = odVogel( i, ${q.pcssFilter}, phi + 1.7 ) * fUV;
			float zc = zr + dot( dz, o ) - ${f(0.015 / BOX_D)};
			lit += step( zc, texture2D( shadowMap, uv + o ).r );
		}
		float s = lit / ${f(q.pcssFilter)};
		s = mix( 1.0, s, smoothstep( 0.0, 0.05, edge ) );
		return mix( 1.0, s, shadowIntensity );
	}
`;

  // swap the BASIC branch's getShadow (the last of the three variants) for the PCSS one
  const src = ShaderChunk.shadowmap_pars_fragment;
  const fnStart = src.lastIndexOf('float getShadow(');
  const fnEnd = src.indexOf('#endif', src.indexOf('return mix( 1.0, shadow, shadowIntensity );', fnStart));
  if (fnStart < 0 || fnEnd < 0 || !src.slice(fnStart, fnEnd).includes('texture2D( shadowMap, shadowCoord.xy ).r'))
    throw new Error('shadowmap_pars_fragment layout changed');
  ShaderChunk.shadowmap_pars_fragment = src.slice(0, fnStart) + pcss + '\n\t' + src.slice(fnEnd);
}

/** The sun, with a shadow box that follows `focus` and stays on the texel grid. */
export class SunRig {
  readonly light: DirectionalLight;
  readonly target = new Object3D();
  private readonly ax = new Vector3();
  private readonly ay = new Vector3();
  private readonly az = SUN_DIR.clone();
  private readonly tx: number;
  private readonly ty: number;

  constructor(q: Quality, color: Vector3, intensity: number) {
    const light = new DirectionalLight(0xffffff, intensity);
    // the shadow map is re-rendered every other frame (see tick); fronds still sway at 30 Hz
    light.color.setRGB(color.x, color.y, color.z);
    light.castShadow = true;
    light.target = this.target;
    const s = light.shadow;
    s.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    s.bias = -0.0000015;
    s.normalBias = 0.035;
    const cam = s.camera as OrthographicCamera;
    const W = q.shadowLength;
    cam.left = -W / 2;
    cam.right = W / 2;
    cam.top = BOX_H / 2;
    cam.bottom = -BOX_H / 2;
    cam.near = 0;
    cam.far = BOX_D;
    cam.updateProjectionMatrix();
    this.light = light;
    // the shadow camera's own axes (Matrix4.lookAt with up = +Y)
    this.ax.crossVectors(new Vector3(0, 1, 0), this.az).normalize();
    this.ay.crossVectors(this.az, this.ax).normalize();
    this.tx = W / q.shadowMapSize;
    this.ty = BOX_H / q.shadowMapSize;
  }

  private frame = 0;
  /** Call once per frame before rendering: re-render the shadow map on alternate frames. */
  tick(): void {
    this.frame++;
    this.light.shadow.autoUpdate = false;
    if (this.frame % 2 === 0) this.light.shadow.needsUpdate = true;
  }

  /** Follow a point on the street (only its z matters: the box always spans the cross-section). */
  follow(z: number): void {
    const ref = new Vector3(38, 16, z);
    const cr = Math.round(ref.dot(this.ax) / this.tx) * this.tx;
    const cu = Math.round(ref.dot(this.ay) / this.ty) * this.ty;
    const cf = ref.dot(this.az);
    const c = new Vector3().addScaledVector(this.ax, cr).addScaledVector(this.ay, cu).addScaledVector(this.az, cf);
    this.target.position.copy(c);
    this.light.position.copy(c).addScaledVector(this.az, BOX_D / 2);
    this.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
  }
}
