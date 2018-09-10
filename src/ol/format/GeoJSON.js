/**
 * @module ol/format/GeoJSON
 */
// TODO: serialize dataProjection as crs member when writing
// see https://github.com/openlayers/openlayers/issues/2078

import {assert} from '../asserts.js';
import Feature from '../Feature.js';
import {transformWithOptions} from '../format/Feature.js';
import JSONFeature from '../format/JSONFeature.js';
import GeometryCollection from '../geom/GeometryCollection.js';
import LineString from '../geom/LineString.js';
import MultiLineString from '../geom/MultiLineString.js';
import MultiPoint from '../geom/MultiPoint.js';
import MultiPolygon from '../geom/MultiPolygon.js';
import Point from '../geom/Point.js';
import Polygon from '../geom/Polygon.js';
import {assign, isEmpty} from '../obj.js';
import {get as getProjection} from '../proj.js';
import GeometryType from '../geom/GeometryType.js';

/**
 * @typedef {import("geojson").GeoJSON} GeoJSONObject
 * @typedef {import("geojson").Feature} GeoJSONFeature
 * @typedef {import("geojson").FeatureCollection} GeoJSONFeatureCollection
 * @typedef {import("geojson").Geometry} GeoJSONGeometry
 * @typedef {import("geojson").Point} GeoJSONPoint
 * @typedef {import("geojson").LineString} GeoJSONLineString
 * @typedef {import("geojson").Polygon} GeoJSONPolygon
 * @typedef {import("geojson").MultiPoint} GeoJSONMultiPoint
 * @typedef {import("geojson").MultiLineString} GeoJSONMultiLineString
 * @typedef {import("geojson").MultiPolygon} GeoJSONMultiPolygon
 * @typedef {import("geojson").GeometryCollection} GeoJSONGeometryCollection
 */


/**
 * @typedef {Object} Options
 * @property {import("../proj.js").ProjectionLike} [dataProjection='EPSG:4326'] Default data projection.
 * @property {import("../proj.js").ProjectionLike} [featureProjection] Projection for features read or
 * written by the format.  Options passed to read or write methods will take precedence.
 * @property {string} [geometryName] Geometry name to use when creating features.
 * @property {boolean} [extractGeometryName=false] Certain GeoJSON providers include
 * the geometry_name field in the feature GeoJSON. If set to `true` the GeoJSON reader
 * will look for that field to set the geometry name. If both this field is set to `true`
 * and a `geometryName` is provided, the `geometryName` will take precedence.
 */


/**
 * @classdesc
 * Feature format for reading and writing data in the GeoJSON format.
 *
  * @api
 */
class GeoJSON extends JSONFeature {

  /**
   * @param {Options=} opt_options Options.
   */
  constructor(opt_options) {

    const options = opt_options ? opt_options : {};

    super();

    /**
     * @inheritDoc
     */
    this.dataProjection = getProjection(
      options.dataProjection ?
        options.dataProjection : 'EPSG:4326');

    if (options.featureProjection) {
      this.defaultFeatureProjection = getProjection(options.featureProjection);
    }

    /**
     * Name of the geometry attribute for features.
     * @type {string|undefined}
     * @private
     */
    this.geometryName_ = options.geometryName;

    /**
     * Look for the geometry name in the feature GeoJSON
     * @type {boolean|undefined}
     * @private
     */
    this.extractGeometryName_ = options.extractGeometryName;

  }

  /**
   * @inheritDoc
   */
  readFeatureFromObject(object, opt_options) {
    /**
     * @type {GeoJSONFeature}
     */
    let geoJSONFeature = null;
    if (object['type'] === 'Feature') {
      geoJSONFeature = /** @type {GeoJSONFeature} */ (object);
    } else {
      geoJSONFeature = /** @type {GeoJSONFeature} */ ({
        type: 'Feature',
        geometry: /** @type {GeoJSONGeometry} */ (object)
      });
    }

    const geometry = readGeometry(geoJSONFeature['geometry'], opt_options);
    const feature = new Feature();
    if (this.geometryName_) {
      feature.setGeometryName(this.geometryName_);
    } else if (this.extractGeometryName_ && 'geometry_name' in geoJSONFeature !== undefined) {
      feature.setGeometryName(geoJSONFeature['geometry_name']);
    }
    feature.setGeometry(geometry);
    if ('id' in geoJSONFeature) {
      feature.setId(geoJSONFeature['id']);
    }
    if ('properties' in geoJSONFeature) {
      feature.setProperties(geoJSONFeature['properties']);
    }
    return feature;
  }

  /**
   * @inheritDoc
   */
  readFeaturesFromObject(object, opt_options) {
    const geoJSONObject = /** @type {GeoJSONObject} */ (object);
    /** @type {Array<import("../Feature.js").default>} */
    let features = null;
    if (geoJSONObject['type'] === 'FeatureCollection') {
      const geoJSONFeatureCollection = /** @type {GeoJSONFeatureCollection} */ (object);
      features = [];
      const geoJSONFeatures = geoJSONFeatureCollection['features'];
      for (let i = 0, ii = geoJSONFeatures.length; i < ii; ++i) {
        features.push(this.readFeatureFromObject(geoJSONFeatures[i], opt_options));
      }
    } else {
      features = [this.readFeatureFromObject(object, opt_options)];
    }
    return features;
  }

  /**
   * @inheritDoc
   */
  readGeometryFromObject(object, opt_options) {
    return readGeometry(/** @type {GeoJSONGeometry} */ (object), opt_options);
  }

  /**
   * @inheritDoc
   */
  readProjectionFromObject(object) {
    const crs = object['crs'];
    let projection;
    if (crs) {
      if (crs['type'] == 'name') {
        projection = getProjection(crs['properties']['name']);
      } else {
        assert(false, 36); // Unknown SRS type
      }
    } else {
      projection = this.dataProjection;
    }
    return (
      /** @type {import("../proj/Projection.js").default} */ (projection)
    );
  }

  /**
   * Encode a feature as a GeoJSON Feature object.
   *
   * @param {import("../Feature.js").default} feature Feature.
   * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
   * @return {GeoJSONFeature} Object.
   * @override
   * @api
   */
  writeFeatureObject(feature, opt_options) {
    opt_options = this.adaptOptions(opt_options);

    const object = /** @type {GeoJSONFeature} */ ({
      'type': 'Feature'
    });
    const id = feature.getId();
    if (id !== undefined) {
      object.id = id;
    }
    const geometry = feature.getGeometry();
    if (geometry) {
      object.geometry = writeGeometry(geometry, opt_options);
    } else {
      object.geometry = null;
    }
    const properties = feature.getProperties();
    delete properties[feature.getGeometryName()];
    if (!isEmpty(properties)) {
      object.properties = properties;
    } else {
      object.properties = null;
    }
    return object;
  }

  /**
   * Encode an array of features as a GeoJSON object.
   *
   * @param {Array<import("../Feature.js").default>} features Features.
   * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
   * @return {GeoJSONFeatureCollection} GeoJSON Object.
   * @override
   * @api
   */
  writeFeaturesObject(features, opt_options) {
    opt_options = this.adaptOptions(opt_options);
    const objects = [];
    for (let i = 0, ii = features.length; i < ii; ++i) {
      objects.push(this.writeFeatureObject(features[i], opt_options));
    }
    return /** @type {GeoJSONFeatureCollection} */ ({
      type: 'FeatureCollection',
      features: objects
    });
  }

  /**
   * Encode a geometry as a GeoJSON object.
   *
   * @param {import("../geom/Geometry.js").default} geometry Geometry.
   * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
   * @return {GeoJSONGeometry|GeoJSONGeometryCollection} Object.
   * @override
   * @api
   */
  writeGeometryObject(geometry, opt_options) {
    return writeGeometry(geometry, this.adaptOptions(opt_options));
  }
}


/**
 * @param {GeoJSONGeometry|GeoJSONGeometryCollection} object Object.
 * @param {import("./Feature.js").ReadOptions=} opt_options Read options.
 * @return {import("../geom/Geometry.js").default} Geometry.
 */
function readGeometry(object, opt_options) {
  if (!object) {
    return null;
  }

  /**
   * @type {import("../geom/Geometry.js").default}
   */
  let geometry;
  switch (object['type']) {
    case GeometryType.POINT: {
      geometry = readPointGeometry(/** @type {GeoJSONPoint} */ (object));
      break;
    }
    case GeometryType.LINE_STRING: {
      geometry = readLineStringGeometry(/** @type {GeoJSONLineString} */ (object));
      break;
    }
    case GeometryType.POLYGON: {
      geometry = readPolygonGeometry(/** @type {GeoJSONPolygon} */ (object));
      break;
    }
    case GeometryType.MULTI_POINT: {
      geometry = readMultiPointGeometry(/** @type {GeoJSONMultiPoint} */ (object));
      break;
    }
    case GeometryType.MULTI_LINE_STRING: {
      geometry = readMultiLineStringGeometry(/** @type {GeoJSONMultiLineString} */ (object));
      break;
    }
    case GeometryType.MULTI_POLYGON: {
      geometry = readMultiPolygonGeometry(/** @type {GeoJSONMultiPolygon} */ (object));
      break;
    }
    case GeometryType.GEOMETRY_COLLECTION: {
      geometry = readGeometryCollectionGeometry(/** @type {GeoJSONGeometryCollection} */ (object));
      break;
    }
    default: {
      throw new Error('Unsupported GeoJSON type: ' + object.type);
    }
  }
  return transformWithOptions(geometry, false, opt_options);
}


/**
 * @param {GeoJSONGeometryCollection} object Object.
 * @param {import("./Feature.js").ReadOptions=} opt_options Read options.
 * @return {import("../geom/GeometryCollection.js").default} Geometry collection.
 */
function readGeometryCollectionGeometry(object, opt_options) {
  const geometries = object['geometries'].map(
    /**
     * @param {GeoJSONGeometry} geometry Geometry.
     * @return {import("../geom/Geometry.js").default} geometry Geometry.
     */
    function(geometry) {
      return readGeometry(geometry, opt_options);
    });
  return new GeometryCollection(geometries);
}


/**
 * @param {GeoJSONPoint} object Object.
 * @return {import("../geom/Point.js").default} Point.
 */
function readPointGeometry(object) {
  return new Point(object['coordinates']);
}


/**
 * @param {GeoJSONLineString} object Object.
 * @return {import("../geom/LineString.js").default} LineString.
 */
function readLineStringGeometry(object) {
  return new LineString(object['coordinates']);
}


/**
 * @param {GeoJSONMultiLineString} object Object.
 * @return {import("../geom/MultiLineString.js").default} MultiLineString.
 */
function readMultiLineStringGeometry(object) {
  return new MultiLineString(object['coordinates']);
}


/**
 * @param {GeoJSONMultiPoint} object Object.
 * @return {import("../geom/MultiPoint.js").default} MultiPoint.
 */
function readMultiPointGeometry(object) {
  return new MultiPoint(object['coordinates']);
}


/**
 * @param {GeoJSONMultiPolygon} object Object.
 * @return {import("../geom/MultiPolygon.js").default} MultiPolygon.
 */
function readMultiPolygonGeometry(object) {
  return new MultiPolygon(object['coordinates']);
}


/**
 * @param {GeoJSONPolygon} object Object.
 * @return {import("../geom/Polygon.js").default} Polygon.
 */
function readPolygonGeometry(object) {
  return new Polygon(object['coordinates']);
}


/**
 * @param {import("../geom/Geometry.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writeGeometry(geometry, opt_options) {
  geometry = transformWithOptions(geometry, true, opt_options);
  const type = geometry.getType();

  /** @type {GeoJSONGeometry} */
  let geoJSON;
  switch (type) {
    case GeometryType.POINT: {
      geoJSON = writePointGeometry(/** @type {import("../geom/Point.js").default} */ (geometry), opt_options);
      break;
    }
    case GeometryType.LINE_STRING: {
      geoJSON = writeLineStringGeometry(/** @type {import("../geom/LineString.js").default} */ (geometry), opt_options);
      break;
    }
    case GeometryType.POLYGON: {
      geoJSON = writePolygonGeometry(/** @type {import("../geom/Polygon.js").default} */ (geometry), opt_options);
      break;
    }
    case GeometryType.MULTI_POINT: {
      geoJSON = writeMultiPointGeometry(/** @type {import("../geom/MultiPoint.js").default} */ (geometry), opt_options);
      break;
    }
    case GeometryType.MULTI_LINE_STRING: {
      geoJSON = writeMultiLineStringGeometry(/** @type {import("../geom/MultiLineString.js").default} */ (geometry), opt_options);
      break;
    }
    case GeometryType.MULTI_POLYGON: {
      geoJSON = writeMultiPolygonGeometry(/** @type {import("../geom/MultiPolygon.js").default} */ (geometry), opt_options);
      break;
    }
    case GeometryType.GEOMETRY_COLLECTION: {
      geoJSON = writeGeometryCollectionGeometry(/** @type {import("../geom/GeometryCollection.js").default} */ (geometry), opt_options);
      break;
    }
    default: {
      throw new Error('Unsupported geometry type: ' + type);
    }
  }
  return geoJSON;
}


/**
 * @param {import("../geom/GeometryCollection.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometryCollection} GeoJSON geometry collection.
 */
function writeGeometryCollectionGeometry(geometry, opt_options) {
  const geometries = geometry.getGeometriesArray().map(function(geometry) {
    const options = assign({}, opt_options);
    delete options.featureProjection;
    return writeGeometry(geometry, options);
  });
  return /** @type {GeoJSONGeometryCollection} */ ({
    type: 'GeometryCollection',
    geometries: geometries
  });
}


/**
 * @param {import("../geom/LineString.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writeLineStringGeometry(geometry, opt_options) {
  return /** @type {GeoJSONGeometry} */ ({
    type: 'LineString',
    coordinates: geometry.getCoordinates()
  });
}


/**
 * @param {import("../geom/MultiLineString.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writeMultiLineStringGeometry(geometry, opt_options) {
  return /** @type {GeoJSONGeometry} */ ({
    type: 'MultiLineString',
    coordinates: geometry.getCoordinates()
  });
}


/**
 * @param {import("../geom/MultiPoint.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writeMultiPointGeometry(geometry, opt_options) {
  return /** @type {GeoJSONGeometry} */ ({
    type: 'MultiPoint',
    coordinates: geometry.getCoordinates()
  });
}


/**
 * @param {import("../geom/MultiPolygon.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writeMultiPolygonGeometry(geometry, opt_options) {
  let right;
  if (opt_options) {
    right = opt_options.rightHanded;
  }
  return /** @type {GeoJSONGeometry} */ ({
    type: 'MultiPolygon',
    coordinates: geometry.getCoordinates(right)
  });
}


/**
 * @param {import("../geom/Point.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writePointGeometry(geometry, opt_options) {
  return /** @type {GeoJSONGeometry} */ ({
    type: 'Point',
    coordinates: geometry.getCoordinates()
  });
}


/**
 * @param {import("../geom/Polygon.js").default} geometry Geometry.
 * @param {import("./Feature.js").WriteOptions=} opt_options Write options.
 * @return {GeoJSONGeometry} GeoJSON geometry.
 */
function writePolygonGeometry(geometry, opt_options) {
  let right;
  if (opt_options) {
    right = opt_options.rightHanded;
  }
  return /** @type {GeoJSONGeometry} */ ({
    type: 'Polygon',
    coordinates: geometry.getCoordinates(right)
  });
}


export default GeoJSON;
