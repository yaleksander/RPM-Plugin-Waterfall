// https://codesandbox.io/p/sandbox/funny-lake-7rkse

import { RPM } from "../path.js"
import { THREE } from "../../System/Globals.js";
import { Particle, ParticleSystem } from "./ParticleSystem.js";

const pluginName = "Waterfall";

const loader = new THREE.TextureLoader();
const path = RPM.Common.Paths.PLUGINS + pluginName + "/";
const noiseMap = loader.load(path + "textures/noise.jpg");
const dudvMap = loader.load(path + "textures/dudv.png");

var vert = null;
var frag = null;
var waterfallList = [];
var particlesList = [];
var mapID = 0;
var emissionTime = 0;
var nextEmissionTime = 0;
var t0 = 0;
var t1 = 0;

noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
noiseMap.minFilter = THREE.NearestFilter;
noiseMap.magFilter = THREE.NearestFilter;
dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;

function newParticleSystem(color, radius, height, shape)
{
	const particleSystem = new ParticleSystem();
	particleSystem.radius = radius;
	particleSystem.height = height;
	particleSystem.shape = shape;
	const particleGeometry = new THREE.SphereBufferGeometry(1, 16, 8).toNonIndexed();
	const particleMaterial = new THREE.MeshBasicMaterial({color: color, alphaMap: noiseMap});
	const str1 = "vec3 transformed = vec3(position);\ntransformed.y += t * 0.25;\nvT = t;";
	const str2 = "float dissolve = abs(sin(1.0 - vT)) - texture2D(alphaMap, vUv).g;\nif (dissolve < 0.01) discard;";
	particleMaterial.onBeforeCompile = function (shader)
	{
		shader.vertexShader = "attribute float t;\nvarying float vT;\n" + shader.vertexShader;
		shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", str1);
		shader.fragmentShader = "varying float vT;\n" + shader.fragmentShader;
		shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", str2);
	};
	particleSystem.init(particleGeometry, particleMaterial, 250);
	return particleSystem;
}

async function init()
{
	vert = await RPM.Common.IO.openFile(path + "shaders/waterfall.vert");
	frag = await RPM.Common.IO.openFile(path + "shaders/waterfall.frag");
}
init();

setInterval(function ()
{
	if (RPM.Manager.Stack.top instanceof RPM.Scene.Map && !RPM.Scene.Map.current.loading)
	{
		if (mapID != RPM.Scene.Map.current.id)
		{
			waterfallList = [];
			mapID = RPM.Scene.Map.current.id;
		}
		t0 = t1;
		t1 = RPM.Core.Game.current.playTime.time;
		for (var i = 0; i < particlesList.length; i++)
			updateParticles(particlesList[i], t1 - t0);
		for (var i = 0; i < waterfallList.length; i++)
			waterfallList[i].material.uniforms.time.value = t1;
	}
}, 16);

function updateParticles(particleSystem, delta)
{
	delta *= 0.001;
	emissionTime += delta;
	if (emissionTime > nextEmissionTime)
	{
		const particle = new Particle();
		const r = particleSystem.radius;
		const h = particleSystem.height;
		const s = particleSystem.shape;
		const particlePerSecond = 50 * r / RPM.Datas.Systems.SQUARE_SIZE;
		const t = 1 / particlePerSecond;
		nextEmissionTime = emissionTime + t / 2 + (t / 2) * Math.random();
		const rand = Math.random();
		switch (s)
		{
			case 2:
				const rx = Math.round(Math.random() * 2 - 1);
				const rz = Math.round(Math.random() * 2 - 1);
				const rr = Math.round(Math.random());
				const rs = Math.round(Math.random()) === 0 ? -r : r;
				particle.position.x = (rr === 1 ? ((rand - 0.5) * r * 2) : rs);
				particle.position.y = 0;
				particle.position.z = (rr === 0 ? ((rand - 0.5) * r * 2) : rs);
				break;
			case 4:
				particle.position.x = (rand - 0.5) * r * 2;
				particle.position.y = 0;
				particle.position.z = 0;
				break;
			default:
				particle.position.x = Math.sin(2 * Math.PI * rand) * r;
				particle.position.y = 0;
				particle.position.z = Math.cos(2 * Math.PI * rand) * r;
		}
		particle.size = (Math.random() * 0.25 + 0.5) * (h * 0.05 + r * 0.1);
		particle.lifetime = Math.random() * 0.2 + 0.5;
		particleSystem.add(particle);
	}
	particleSystem.update(delta);
}

RPM.Manager.Plugins.registerCommand(pluginName, "Create waterfall", (id, diameter, height, shape, speed, darkColor01, darkColor02, lightColor01, lightColor02, foamColor, addFoam) =>
{
	if (id == -1)
		id = RPM.Core.ReactionInterpreter.currentObject.id;
	RPM.Core.MapObject.search(id, (result) =>
	{
		if (!!result)
		{
			const u =
			{
				time: {value: 0},
				speed: {value: speed},
				tNoise: {value: noiseMap},
				tDudv: {value: dudvMap},
				topDarkColor: {value: darkColor01.color},
				bottomDarkColor: {value: darkColor02.color},
				topLightColor: {value: lightColor01.color},
				bottomLightColor: {value: lightColor02.color},
				foamColor: {value: foamColor.color}
			};
			const m = new THREE.ShaderMaterial(
			{
				uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib['fog'], u]),
				vertexShader: vert,
				fragmentShader: frag,
				fog: true,
			});
			const r = diameter * RPM.Datas.Systems.SQUARE_SIZE / 2;
			const h = height * RPM.Datas.Systems.SQUARE_SIZE;
			var w;
			switch (shape)
			{
				case 2:
					w = new THREE.Mesh(new THREE.BoxBufferGeometry(r * 2, h * 1.1, r * 2), m);
					break;
				case 3:
					w = new THREE.Mesh(new THREE.SphereBufferGeometry(r), m);
					break;
				case 4:
					w = new THREE.Mesh(new THREE.PlaneBufferGeometry(r * 2, h * 1.1), m);
					m.side = THREE.DoubleSide;
					break;
				default:
					w = new THREE.Mesh(new THREE.CylinderBufferGeometry(r, r, h * 1.1, 32, 1, true), m);
			}
			RPM.Scene.Map.current.scene.remove(result.object.mesh);
			result.object.mesh = new THREE.Mesh();
			w.position.y += h * 0.45;
			result.object.mesh.add(w);
			waterfallList.push(w);
			if (addFoam && shape !== 3)
			{
				const p = newParticleSystem(foamColor.color, r, h, shape);
				result.object.mesh.add(p._instancedMesh);
				particlesList.push(p);
			}
			RPM.Scene.Map.current.scene.add(result.object.mesh);
		}
	}, RPM.Core.ReactionInterpreter.currentObject);
});
