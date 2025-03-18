const refreshUniforms = [
	"alphaMap",
	"alphaTest",
	"anisotropy",
	"anisotropyMap",
	"anisotropyRotation",
	"aoMap",
	"attenuationColor",
	"attenuationDistance",
	"bumpMap",
	"clearcoat",
	"clearcoatMap",
	"clearcoatNormalMap",
	"clearcoatNormalScale",
	"clearcoatRoughness",
	"color",
	"dispersion",
	"displacementMap",
	"emissive",
	"emissiveMap",
	"envMap",
	"gradientMap",
	"ior",
	"iridescence",
	"iridescenceIOR",
	"iridescenceMap",
	"iridescenceThicknessMap",
	"lightMap",
	"map",
	"matcap",
	"metalness",
	"metalnessMap",
	"normalMap",
	"normalScale",
	"opacity",
	"roughness",
	"roughnessMap",
	"sheen",
	"sheenColor",
	"sheenColorMap",
	"sheenRoughnessMap",
	"shininess",
	"specular",
	"specularColor",
	"specularColorMap",
	"specularIntensity",
	"specularIntensityMap",
	"specularMap",
	"thickness",
	"transmission",
	"transmissionMap",
]

/**
 * This class is used by {@link WebGPURenderer} as management component.
 * It's primary purpose is to determine whether render objects require a
 * refresh right before they are going to be rendered or not.
 */
class NodeMaterialObserver {
	/**
	 * Constructs a new node material observer.
	 *
	 * @param {NodeBuilder} builder - The node builder.
	 */
	constructor(builder) {
		/**
		 * A node material can be used by more than one render object so the
		 * monitor must maintain a list of render objects.
		 *
		 * @type {WeakMap<RenderObject,Object>}
		 */
		this.renderObjects = new WeakMap()

		/**
		 * Whether the material uses node objects or not.
		 *
		 * @type {boolean}
		 */
		this.hasNode = this.containsNode(builder)

		/**
		 * Whether the node builder's 3D object is animated or not.
		 *
		 * @type {boolean}
		 */
		this.hasAnimation = builder.object.isSkinnedMesh === true

		/**
		 * A list of all possible material uniforms
		 *
		 * @type {Array<string>}
		 */
		this.refreshUniforms = refreshUniforms

		/**
		 * Holds the current render ID from the node frame.
		 *
		 * @type {number}
		 * @default 0
		 */
		this.renderId = 0
	}

	/**
	 * Returns `true` if the given render object is verified for the first time of this observer.
	 *
	 * @param {RenderObject} renderObject - The render object.
	 * @return {boolean} Whether the given render object is verified for the first time of this observer.
	 */
	firstInitialization(renderObject) {
		const hasInitialized = this.renderObjects.has(renderObject)

		if (hasInitialized === false) {
			this.getRenderObjectData(renderObject)

			return true
		}

		return false
	}

	/**
	 * Returns monitoring data for the given render object.
	 *
	 * @param {RenderObject} renderObject - The render object.
	 * @return {Object} The monitoring data.
	 */
	getRenderObjectData(renderObject) {
		let data = this.renderObjects.get(renderObject)

		if (data === undefined) {
			const { geometry, material, object } = renderObject

			data = {
				material: this.getMaterialData(material),
				geometry: {
					id: geometry.id,
					attributes: this.getAttributesData(geometry.attributes),
					indexVersion: geometry.index ? geometry.index.version : null,
					drawRange: { start: geometry.drawRange.start, count: geometry.drawRange.count },
				},
				worldMatrix: object.matrixWorld.clone(),
			}

			if (object.center) {
				data.center = object.center.clone()
			}

			if (object.morphTargetInfluences) {
				data.morphTargetInfluences = object.morphTargetInfluences.slice()
			}

			if (renderObject.bundle !== null) {
				data.version = renderObject.bundle.version
			}

			if (data.material.transmission > 0) {
				const { width, height } = renderObject.context

				data.bufferWidth = width
				data.bufferHeight = height
			}

			this.renderObjects.set(renderObject, data)
		}

		return data
	}

	/**
	 * Returns an attribute data structure holding the attributes versions for
	 * monitoring.
	 *
	 * @param {Object} attributes - The geometry attributes.
	 * @return {Object} An object for monitoring the versions of attributes.
	 */
	getAttributesData(attributes) {
		const attributesData = {}

		for (const name in attributes) {
			const attribute = attributes[name]

			attributesData[name] = {
				version: attribute.version,
			}
		}

		return attributesData
	}

	/**
	 * Returns `true` if the node builder's material uses
	 * node properties.
	 *
	 * @param {NodeBuilder} builder - The current node builder.
	 * @return {boolean} Whether the node builder's material uses node properties or not.
	 */
	containsNode(builder) {
		const material = builder.material

		for (const property in material) {
			if (material[property] && material[property].isNode) return true
		}

		if (builder.renderer.nodes.modelViewMatrix !== null || builder.renderer.nodes.modelNormalViewMatrix !== null) return true

		return false
	}

	/**
	 * Returns a material data structure holding the material property values for
	 * monitoring.
	 *
	 * @param {Material} material - The material.
	 * @return {Object} An object for monitoring material properties.
	 */
	getMaterialData(material) {
		const data = {}

		for (const property of this.refreshUniforms) {
			const value = material[property]

			if (value === null || value === undefined) continue

			if (typeof value === "object" && value.clone !== undefined) {
				if (value.isTexture === true) {
					data[property] = { id: value.id, version: value.version }
				} else {
					data[property] = value.clone()
				}
			} else {
				data[property] = value
			}
		}

		return data
	}

	/**
	 * Returns `true` if the given render object has not changed its state.
	 *
	 * @param {RenderObject} renderObject - The render object.
	 * @return {boolean} Whether the given render object has changed its state or not.
	 */
	equals(renderObject) {
		const { object, material, geometry } = renderObject

		const renderObjectData = this.getRenderObjectData(renderObject)

		// world matrix

		if (renderObjectData.worldMatrix.equals(object.matrixWorld) !== true) {
			renderObjectData.worldMatrix.copy(object.matrixWorld)

			return false
		}

		// material

		const materialData = renderObjectData.material

		for (const property in materialData) {
			const value = materialData[property]
			const mtlValue = material[property]

			if (value.equals !== undefined) {
				if (value.equals(mtlValue) === false) {
					value.copy(mtlValue)

					return false
				}
			} else if (mtlValue.isTexture === true) {
				if (value.id !== mtlValue.id || value.version !== mtlValue.version) {
					value.id = mtlValue.id
					value.version = mtlValue.version

					return false
				}
			} else if (value !== mtlValue) {
				materialData[property] = mtlValue

				return false
			}
		}

		if (materialData.transmission > 0) {
			const { width, height } = renderObject.context

			if (renderObjectData.bufferWidth !== width || renderObjectData.bufferHeight !== height) {
				renderObjectData.bufferWidth = width
				renderObjectData.bufferHeight = height

				return false
			}
		}

		// geometry

		const storedGeometryData = renderObjectData.geometry
		const attributes = geometry.attributes
		const storedAttributes = storedGeometryData.attributes

		const storedAttributeNames = Object.keys(storedAttributes)
		const currentAttributeNames = Object.keys(attributes)

		if (storedGeometryData.id !== geometry.id) {
			storedGeometryData.id = geometry.id
			return false
		}

		if (storedAttributeNames.length !== currentAttributeNames.length) {
			renderObjectData.geometry.attributes = this.getAttributesData(attributes)
			return false
		}

		// compare each attribute

		for (const name of storedAttributeNames) {
			const storedAttributeData = storedAttributes[name]
			const attribute = attributes[name]

			if (attribute === undefined) {
				// attribute was removed
				delete storedAttributes[name]
				return false
			}

			if (storedAttributeData.version !== attribute.version) {
				storedAttributeData.version = attribute.version
				return false
			}
		}

		// check index

		const index = geometry.index
		const storedIndexVersion = storedGeometryData.indexVersion
		const currentIndexVersion = index ? index.version : null

		if (storedIndexVersion !== currentIndexVersion) {
			storedGeometryData.indexVersion = currentIndexVersion
			return false
		}

		// check drawRange

		if (storedGeometryData.drawRange.start !== geometry.drawRange.start || storedGeometryData.drawRange.count !== geometry.drawRange.count) {
			storedGeometryData.drawRange.start = geometry.drawRange.start
			storedGeometryData.drawRange.count = geometry.drawRange.count
			return false
		}

		// morph targets

		if (renderObjectData.morphTargetInfluences) {
			let morphChanged = false

			for (let i = 0; i < renderObjectData.morphTargetInfluences.length; i++) {
				if (renderObjectData.morphTargetInfluences[i] !== object.morphTargetInfluences[i]) {
					morphChanged = true
				}
			}

			if (morphChanged) return true
		}

		// center

		if (renderObjectData.center) {
			if (renderObjectData.center.equals(object.center) === false) {
				renderObjectData.center.copy(object.center)

				return true
			}
		}

		// bundle

		if (renderObject.bundle !== null) {
			renderObjectData.version = renderObject.bundle.version
		}

		return true
	}

	/**
	 * Checks if the given render object requires a refresh.
	 *
	 * @param {RenderObject} renderObject - The render object.
	 * @param {NodeFrame} nodeFrame - The current node frame.
	 * @return {boolean} Whether the given render object requires a refresh or not.
	 */
	needsRefresh(renderObject, nodeFrame) {
		if (this.hasNode || this.hasAnimation || this.firstInitialization(renderObject)) return true

		const { renderId } = nodeFrame

		if (this.renderId !== renderId) {
			this.renderId = renderId

			return true
		}

		const isStatic = renderObject.object.static === true
		const isBundle = renderObject.bundle !== null && renderObject.bundle.static === true && this.getRenderObjectData(renderObject).version === renderObject.bundle.version

		if (isStatic || isBundle) return false

		const notEqual = this.equals(renderObject) !== true

		return notEqual
	}
}

export default NodeMaterialObserver
