define('echarts/chart/map', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Path',
    'zrender/shape/Circle',
    'zrender/shape/Rectangle',
    'zrender/shape/Line',
    'zrender/shape/Polygon',
    'zrender/shape/Ellipse',
    '../component/dataRange',
    '../component/roamController',
    '../config',
    '../util/ecData',
    'zrender/tool/util',
    'zrender/config',
    'zrender/tool/event',
    '../util/mapData/params',
    '../util/mapData/textFixed',
    '../util/mapData/geoCoord',
    '../util/projection/svg',
    '../util/projection/normal',
    '../chart'
], function (require) {
    var ChartBase = require('./base');
    var TextShape = require('zrender/shape/Text');
    var PathShape = require('zrender/shape/Path');
    var CircleShape = require('zrender/shape/Circle');
    var RectangleShape = require('zrender/shape/Rectangle');
    var LineShape = require('zrender/shape/Line');
    var PolygonShape = require('zrender/shape/Polygon');
    var EllipseShape = require('zrender/shape/Ellipse');
    require('../component/dataRange');
    require('../component/roamController');
    var ecConfig = require('../config');
    ecConfig.map = {
        zlevel: 0,
        z: 2,
        mapType: 'china',
        mapValuePrecision: 0,
        showLegendSymbol: true,
        dataRangeHoverLink: true,
        hoverable: true,
        clickable: true,
        itemStyle: {
            normal: {
                borderColor: 'rgba(0,0,0,0)',
                borderWidth: 1,
                areaStyle: { color: '#ccc' },
                label: {
                    show: false,
                    textStyle: { color: 'rgb(139,69,19)' }
                }
            },
            emphasis: {
                borderColor: 'rgba(0,0,0,0)',
                borderWidth: 1,
                areaStyle: { color: 'rgba(255,215,0,0.8)' },
                label: {
                    show: false,
                    textStyle: { color: 'rgb(100,0,0)' }
                }
            }
        }
    };
    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrConfig = require('zrender/config');
    var zrEvent = require('zrender/tool/event');
    var _mapParams = require('../util/mapData/params').params;
    var _textFixed = require('../util/mapData/textFixed');
    var _geoCoord = require('../util/mapData/geoCoord');
    function Map(ecTheme, messageCenter, zr, option, myChart) {
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._onmousewheel = function (params) {
            return self.__onmousewheel(params);
        };
        self._onmousedown = function (params) {
            return self.__onmousedown(params);
        };
        self._onmousemove = function (params) {
            return self.__onmousemove(params);
        };
        self._onmouseup = function (params) {
            return self.__onmouseup(params);
        };
        self._onroamcontroller = function (params) {
            return self.__onroamcontroller(params);
        };
        self._ondrhoverlink = function (params) {
            return self.__ondrhoverlink(params);
        };
        this._isAlive = true;
        this._selectedMode = {};
        this._activeMapType = {};
        this._clickable = {};
        this._hoverable = {};
        this._showLegendSymbol = {};
        this._selected = {};
        this._mapTypeMap = {};
        this._mapDataMap = {};
        this._nameMap = {};
        this._specialArea = {};
        this._refreshDelayTicket;
        this._mapDataRequireCounter;
        this._markAnimation = false;
        this._hoverLinkMap = {};
        this._roamMap = {};
        this._scaleLimitMap = {};
        this._mx;
        this._my;
        this._mousedown;
        this._justMove;
        this._curMapType;
        this.refresh(option);
        this.zr.on(zrConfig.EVENT.MOUSEWHEEL, this._onmousewheel);
        this.zr.on(zrConfig.EVENT.MOUSEDOWN, this._onmousedown);
        messageCenter.bind(ecConfig.EVENT.ROAMCONTROLLER, this._onroamcontroller);
        messageCenter.bind(ecConfig.EVENT.DATA_RANGE_HOVERLINK, this._ondrhoverlink);
    }
    Map.prototype = {
        type: ecConfig.CHART_TYPE_MAP,
        _buildShape: function () {
            var series = this.series;
            this.selectedMap = {};
            this._activeMapType = {};
            var legend = this.component.legend;
            var seriesName;
            var valueData = {};
            var mapType;
            var data;
            var name;
            var mapSeries = {};
            var mapValuePrecision = {};
            var valueCalculation = {};
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].type == ecConfig.CHART_TYPE_MAP) {
                    series[i] = this.reformOption(series[i]);
                    mapType = series[i].mapType;
                    mapSeries[mapType] = mapSeries[mapType] || {};
                    mapSeries[mapType][i] = true;
                    mapValuePrecision[mapType] = mapValuePrecision[mapType] || series[i].mapValuePrecision;
                    this._scaleLimitMap[mapType] = this._scaleLimitMap[mapType] || {};
                    series[i].scaleLimit && zrUtil.merge(this._scaleLimitMap[mapType], series[i].scaleLimit, true);
                    this._roamMap[mapType] = series[i].roam || this._roamMap[mapType];
                    this._hoverLinkMap[mapType] = series[i].dataRangeHoverLink || this._hoverLinkMap[mapType];
                    this._nameMap[mapType] = this._nameMap[mapType] || {};
                    series[i].nameMap && zrUtil.merge(this._nameMap[mapType], series[i].nameMap, true);
                    this._activeMapType[mapType] = true;
                    if (series[i].textFixed) {
                        zrUtil.merge(_textFixed, series[i].textFixed, true);
                    }
                    if (series[i].geoCoord) {
                        zrUtil.merge(_geoCoord, series[i].geoCoord, true);
                    }
                    this._selectedMode[mapType] = this._selectedMode[mapType] || series[i].selectedMode;
                    if (this._hoverable[mapType] == null || this._hoverable[mapType]) {
                        this._hoverable[mapType] = series[i].hoverable;
                    }
                    if (this._clickable[mapType] == null || this._clickable[mapType]) {
                        this._clickable[mapType] = series[i].clickable;
                    }
                    if (this._showLegendSymbol[mapType] == null || this._showLegendSymbol[mapType]) {
                        this._showLegendSymbol[mapType] = series[i].showLegendSymbol;
                    }
                    valueCalculation[mapType] = valueCalculation[mapType] || series[i].mapValueCalculation;
                    seriesName = series[i].name;
                    this.selectedMap[seriesName] = legend ? legend.isSelected(seriesName) : true;
                    if (this.selectedMap[seriesName]) {
                        valueData[mapType] = valueData[mapType] || {};
                        data = series[i].data;
                        for (var j = 0, k = data.length; j < k; j++) {
                            name = this._nameChange(mapType, data[j].name);
                            valueData[mapType][name] = valueData[mapType][name] || { seriesIndex: [] };
                            for (var key in data[j]) {
                                if (key != 'value') {
                                    valueData[mapType][name][key] = data[j][key];
                                } else if (!isNaN(data[j].value)) {
                                    valueData[mapType][name].value == null && (valueData[mapType][name].value = 0);
                                    valueData[mapType][name].value += data[j].value;
                                }
                            }
                            valueData[mapType][name].seriesIndex.push(i);
                        }
                    }
                }
            }
            this._mapDataRequireCounter = 0;
            for (var mt in valueData) {
                this._mapDataRequireCounter++;
            }
            this._clearSelected();
            if (this._mapDataRequireCounter === 0) {
                this.clear();
                this.zr && this.zr.delShape(this.lastShapeList);
                this.lastShapeList = [];
            }
            for (var mt in valueData) {
                if (valueCalculation[mt] && valueCalculation[mt] == 'average') {
                    for (var k in valueData[mt]) {
                        valueData[mt][k].value = (valueData[mt][k].value / valueData[mt][k].seriesIndex.length).toFixed(mapValuePrecision[mt]) - 0;
                    }
                }
                this._mapDataMap[mt] = this._mapDataMap[mt] || {};
                if (this._mapDataMap[mt].mapData) {
                    this._mapDataCallback(mt, valueData[mt], mapSeries[mt])(this._mapDataMap[mt].mapData);
                } else if (_mapParams[mt.replace(/\|.*/, '')].getGeoJson) {
                    this._specialArea[mt] = _mapParams[mt.replace(/\|.*/, '')].specialArea || this._specialArea[mt];
                    _mapParams[mt.replace(/\|.*/, '')].getGeoJson(this._mapDataCallback(mt, valueData[mt], mapSeries[mt]));
                }
            }
        },
        _mapDataCallback: function (mt, vd, ms) {
            var self = this;
            return function (md) {
                if (!self._isAlive || self._activeMapType[mt] == null) {
                    return;
                }
                if (mt.indexOf('|') != -1) {
                    md = self._getSubMapData(mt, md);
                }
                self._mapDataMap[mt].mapData = md;
                if (md.firstChild) {
                    self._mapDataMap[mt].rate = 1;
                    self._mapDataMap[mt].projection = require('../util/projection/svg');
                } else {
                    self._mapDataMap[mt].rate = 0.75;
                    self._mapDataMap[mt].projection = require('../util/projection/normal');
                }
                self._buildMap(mt, self._getProjectionData(mt, md, ms), vd, ms);
                self._buildMark(mt, ms);
                if (--self._mapDataRequireCounter <= 0) {
                    self.addShapeList();
                    self.zr.refreshNextFrame();
                }
            };
        },
        _clearSelected: function () {
            for (var k in this._selected) {
                if (!this._activeMapType[this._mapTypeMap[k]]) {
                    delete this._selected[k];
                    delete this._mapTypeMap[k];
                }
            }
        },
        _getSubMapData: function (mapType, mapData) {
            var subType = mapType.replace(/^.*\|/, '');
            var features = mapData.features;
            for (var i = 0, l = features.length; i < l; i++) {
                if (features[i].properties && features[i].properties.name == subType) {
                    features = features[i];
                    if (subType == 'United States of America' && features.geometry.coordinates.length > 1) {
                        features = {
                            geometry: {
                                coordinates: features.geometry.coordinates.slice(5, 6),
                                type: features.geometry.type
                            },
                            id: features.id,
                            properties: features.properties,
                            type: features.type
                        };
                    }
                    break;
                }
            }
            return {
                'type': 'FeatureCollection',
                'features': [features]
            };
        },
        _getProjectionData: function (mapType, mapData, mapSeries) {
            var normalProjection = this._mapDataMap[mapType].projection;
            var province = [];
            var bbox = this._mapDataMap[mapType].bbox || normalProjection.getBbox(mapData, this._specialArea[mapType]);
            var transform;
            if (!this._mapDataMap[mapType].hasRoam) {
                transform = this._getTransform(bbox, mapSeries, this._mapDataMap[mapType].rate);
            } else {
                transform = this._mapDataMap[mapType].transform;
            }
            var lastTransform = this._mapDataMap[mapType].lastTransform || { scale: {} };
            var pathArray;
            if (transform.left != lastTransform.left || transform.top != lastTransform.top || transform.scale.x != lastTransform.scale.x || transform.scale.y != lastTransform.scale.y) {
                pathArray = normalProjection.geoJson2Path(mapData, transform, this._specialArea[mapType]);
                lastTransform = zrUtil.clone(transform);
            } else {
                transform = this._mapDataMap[mapType].transform;
                pathArray = this._mapDataMap[mapType].pathArray;
            }
            this._mapDataMap[mapType].bbox = bbox;
            this._mapDataMap[mapType].transform = transform;
            this._mapDataMap[mapType].lastTransform = lastTransform;
            this._mapDataMap[mapType].pathArray = pathArray;
            var position = [
                transform.left,
                transform.top
            ];
            for (var i = 0, l = pathArray.length; i < l; i++) {
                province.push(this._getSingleProvince(mapType, pathArray[i], position));
            }
            if (this._specialArea[mapType]) {
                for (var area in this._specialArea[mapType]) {
                    province.push(this._getSpecialProjectionData(mapType, mapData, area, this._specialArea[mapType][area], position));
                }
            }
            if (mapType == 'china') {
                var leftTop = this.geo2pos(mapType, _geoCoord['南海诸岛'] || _mapParams['南海诸岛'].textCoord);
                var scale = transform.scale.x / 10.5;
                var textPosition = [
                    32 * scale + leftTop[0],
                    83 * scale + leftTop[1]
                ];
                if (_textFixed['南海诸岛']) {
                    textPosition[0] += _textFixed['南海诸岛'][0];
                    textPosition[1] += _textFixed['南海诸岛'][1];
                }
                province.push({
                    name: this._nameChange(mapType, '南海诸岛'),
                    path: _mapParams['南海诸岛'].getPath(leftTop, scale),
                    position: position,
                    textX: textPosition[0],
                    textY: textPosition[1]
                });
            }
            return province;
        },
        _getSpecialProjectionData: function (mapType, mapData, areaName, mapSize, position) {
            mapData = this._getSubMapData('x|' + areaName, mapData);
            var normalProjection = require('../util/projection/normal');
            var bbox = normalProjection.getBbox(mapData);
            var leftTop = this.geo2pos(mapType, [
                mapSize.left,
                mapSize.top
            ]);
            var rightBottom = this.geo2pos(mapType, [
                mapSize.left + mapSize.width,
                mapSize.top + mapSize.height
            ]);
            var width = Math.abs(rightBottom[0] - leftTop[0]);
            var height = Math.abs(rightBottom[1] - leftTop[1]);
            var mapWidth = bbox.width;
            var mapHeight = bbox.height;
            var xScale = width / 0.75 / mapWidth;
            var yScale = height / mapHeight;
            if (xScale > yScale) {
                xScale = yScale * 0.75;
                width = mapWidth * xScale;
            } else {
                yScale = xScale;
                xScale = yScale * 0.75;
                height = mapHeight * yScale;
            }
            var transform = {
                OffsetLeft: leftTop[0],
                OffsetTop: leftTop[1],
                scale: {
                    x: xScale,
                    y: yScale
                }
            };
            var pathArray = normalProjection.geoJson2Path(mapData, transform);
            return this._getSingleProvince(mapType, pathArray[0], position);
        },
        _getSingleProvince: function (mapType, path, position) {
            var textPosition;
            var name = path.properties.name;
            var textFixed = _textFixed[name] || [
                0,
                0
            ];
            if (_geoCoord[name]) {
                textPosition = this.geo2pos(mapType, _geoCoord[name]);
            } else if (path.cp) {
                textPosition = [
                    path.cp[0] + textFixed[0],
                    path.cp[1] + textFixed[1]
                ];
            } else {
                var bbox = this._mapDataMap[mapType].bbox;
                textPosition = this.geo2pos(mapType, [
                    bbox.left + bbox.width / 2,
                    bbox.top + bbox.height / 2
                ]);
                textPosition[0] += textFixed[0];
                textPosition[1] += textFixed[1];
            }
            path.name = this._nameChange(mapType, name);
            path.position = position;
            path.textX = textPosition[0];
            path.textY = textPosition[1];
            return path;
        },
        _getTransform: function (bbox, mapSeries, rate) {
            var series = this.series;
            var mapLocation;
            var x;
            var cusX;
            var y;
            var cusY;
            var width;
            var height;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            var padding = Math.round(Math.min(zrWidth, zrHeight) * 0.02);
            for (var key in mapSeries) {
                mapLocation = series[key].mapLocation || {};
                cusX = mapLocation.x || cusX;
                cusY = mapLocation.y || cusY;
                width = mapLocation.width || width;
                height = mapLocation.height || height;
            }
            x = this.parsePercent(cusX, zrWidth);
            x = isNaN(x) ? padding : x;
            y = this.parsePercent(cusY, zrHeight);
            y = isNaN(y) ? padding : y;
            width = width == null ? zrWidth - x - 2 * padding : this.parsePercent(width, zrWidth);
            height = height == null ? zrHeight - y - 2 * padding : this.parsePercent(height, zrHeight);
            var mapWidth = bbox.width;
            var mapHeight = bbox.height;
            var xScale = width / rate / mapWidth;
            var yScale = height / mapHeight;
            if (xScale > yScale) {
                xScale = yScale * rate;
                width = mapWidth * xScale;
            } else {
                yScale = xScale;
                xScale = yScale * rate;
                height = mapHeight * yScale;
            }
            if (isNaN(cusX)) {
                cusX = cusX || 'center';
                switch (cusX + '') {
                case 'center':
                    x = Math.floor((zrWidth - width) / 2);
                    break;
                case 'right':
                    x = zrWidth - width;
                    break;
                }
            }
            if (isNaN(cusY)) {
                cusY = cusY || 'center';
                switch (cusY + '') {
                case 'center':
                    y = Math.floor((zrHeight - height) / 2);
                    break;
                case 'bottom':
                    y = zrHeight - height;
                    break;
                }
            }
            return {
                left: x,
                top: y,
                width: width,
                height: height,
                baseScale: 1,
                scale: {
                    x: xScale,
                    y: yScale
                }
            };
        },
        _buildMap: function (mapType, mapData, valueData, mapSeries) {
            var series = this.series;
            var legend = this.component.legend;
            var dataRange = this.component.dataRange;
            var seriesName;
            var name;
            var data;
            var value;
            var queryTarget;
            var color;
            var font;
            var style;
            var highlightStyle;
            var shape;
            var textShape;
            for (var i = 0, l = mapData.length; i < l; i++) {
                style = zrUtil.clone(mapData[i]);
                highlightStyle = {
                    name: style.name,
                    path: style.path,
                    position: zrUtil.clone(style.position)
                };
                name = style.name;
                data = valueData[name];
                if (data) {
                    queryTarget = [data];
                    seriesName = '';
                    for (var j = 0, k = data.seriesIndex.length; j < k; j++) {
                        queryTarget.push(series[data.seriesIndex[j]]);
                        seriesName += series[data.seriesIndex[j]].name + ' ';
                        if (legend && this._showLegendSymbol[mapType] && legend.hasColor(series[data.seriesIndex[j]].name)) {
                            this.shapeList.push(new CircleShape({
                                zlevel: this.getZlevelBase(),
                                z: this.getZBase() + 1,
                                position: zrUtil.clone(style.position),
                                _mapType: mapType,
                                style: {
                                    x: style.textX + 3 + j * 7,
                                    y: style.textY - 10,
                                    r: 3,
                                    color: legend.getColor(series[data.seriesIndex[j]].name)
                                },
                                hoverable: false
                            }));
                        }
                    }
                    value = data.value;
                } else {
                    data = '-';
                    seriesName = '';
                    queryTarget = [];
                    for (var key in mapSeries) {
                        queryTarget.push(series[key]);
                    }
                    value = '-';
                }
                this.ecTheme.map && queryTarget.push(this.ecTheme.map);
                queryTarget.push(ecConfig);
                color = dataRange && !isNaN(value) ? dataRange.getColor(value) : null;
                style.color = style.color || color || this.getItemStyleColor(this.deepQuery(queryTarget, 'itemStyle.normal.color'), data.seriesIndex, -1, data) || this.deepQuery(queryTarget, 'itemStyle.normal.areaStyle.color');
                style.strokeColor = style.strokeColor || this.deepQuery(queryTarget, 'itemStyle.normal.borderColor');
                style.lineWidth = style.lineWidth || this.deepQuery(queryTarget, 'itemStyle.normal.borderWidth');
                highlightStyle.color = this.getItemStyleColor(this.deepQuery(queryTarget, 'itemStyle.emphasis.color'), data.seriesIndex, -1, data) || this.deepQuery(queryTarget, 'itemStyle.emphasis.areaStyle.color') || style.color;
                highlightStyle.strokeColor = this.deepQuery(queryTarget, 'itemStyle.emphasis.borderColor') || style.strokeColor;
                highlightStyle.lineWidth = this.deepQuery(queryTarget, 'itemStyle.emphasis.borderWidth') || style.lineWidth;
                style.brushType = highlightStyle.brushType = style.brushType || 'both';
                style.lineJoin = highlightStyle.lineJoin = 'round';
                style._name = highlightStyle._name = name;
                font = this.deepQuery(queryTarget, 'itemStyle.normal.label.textStyle');
                textShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase() + 1,
                    position: zrUtil.clone(style.position),
                    _mapType: mapType,
                    _geo: this.pos2geo(mapType, [
                        style.textX,
                        style.textY
                    ]),
                    style: {
                        brushType: 'fill',
                        x: style.textX,
                        y: style.textY,
                        text: this.getLabelText(name, value, queryTarget, 'normal'),
                        _name: name,
                        textAlign: 'center',
                        color: this.deepQuery(queryTarget, 'itemStyle.normal.label.show') ? this.deepQuery(queryTarget, 'itemStyle.normal.label.textStyle.color') : 'rgba(0,0,0,0)',
                        textFont: this.getFont(font)
                    }
                };
                textShape._style = zrUtil.clone(textShape.style);
                textShape.highlightStyle = zrUtil.clone(textShape.style);
                if (this.deepQuery(queryTarget, 'itemStyle.emphasis.label.show')) {
                    textShape.highlightStyle.text = this.getLabelText(name, value, queryTarget, 'emphasis');
                    textShape.highlightStyle.color = this.deepQuery(queryTarget, 'itemStyle.emphasis.label.textStyle.color') || textShape.style.color;
                    font = this.deepQuery(queryTarget, 'itemStyle.emphasis.label.textStyle') || font;
                    textShape.highlightStyle.textFont = this.getFont(font);
                } else {
                    textShape.highlightStyle.color = 'rgba(0,0,0,0)';
                }
                shape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    position: zrUtil.clone(style.position),
                    style: style,
                    highlightStyle: highlightStyle,
                    _style: zrUtil.clone(style),
                    _mapType: mapType
                };
                if (style.scale != null) {
                    shape.scale = zrUtil.clone(style.scale);
                }
                textShape = new TextShape(textShape);
                switch (shape.style.shapeType) {
                case 'rectangle':
                    shape = new RectangleShape(shape);
                    break;
                case 'line':
                    shape = new LineShape(shape);
                    break;
                case 'circle':
                    shape = new CircleShape(shape);
                    break;
                case 'polygon':
                    shape = new PolygonShape(shape);
                    break;
                case 'ellipse':
                    shape = new EllipseShape(shape);
                    break;
                default:
                    shape = new PathShape(shape);
                    if (shape.buildPathArray) {
                        shape.style.pathArray = shape.buildPathArray(shape.style.path);
                    }
                    break;
                }
                if (this._selectedMode[mapType] && this._selected[name] || data.selected && this._selected[name] !== false) {
                    textShape.style = textShape.highlightStyle;
                    shape.style = shape.highlightStyle;
                }
                textShape.clickable = shape.clickable = this._clickable[mapType] && (data.clickable == null || data.clickable);
                if (this._selectedMode[mapType]) {
                    this._selected[name] = this._selected[name] != null ? this._selected[name] : data.selected;
                    this._mapTypeMap[name] = mapType;
                    if (data.selectable == null || data.selectable) {
                        shape.clickable = textShape.clickable = true;
                        shape.onclick = textShape.onclick = this.shapeHandler.onclick;
                    }
                }
                if (this._hoverable[mapType] && (data.hoverable == null || data.hoverable)) {
                    textShape.hoverable = shape.hoverable = true;
                    shape.hoverConnect = textShape.id;
                    textShape.hoverConnect = shape.id;
                } else {
                    textShape.hoverable = shape.hoverable = false;
                }
                ecData.pack(textShape, {
                    name: seriesName,
                    tooltip: this.deepQuery(queryTarget, 'tooltip')
                }, 0, data, 0, name);
                this.shapeList.push(textShape);
                ecData.pack(shape, {
                    name: seriesName,
                    tooltip: this.deepQuery(queryTarget, 'tooltip')
                }, 0, data, 0, name);
                this.shapeList.push(shape);
            }
        },
        _buildMark: function (mapType, mapSeries) {
            this._seriesIndexToMapType = this._seriesIndexToMapType || {};
            this.markAttachStyle = this.markAttachStyle || {};
            var position = [
                this._mapDataMap[mapType].transform.left,
                this._mapDataMap[mapType].transform.top
            ];
            if (mapType == 'none') {
                position = [
                    0,
                    0
                ];
            }
            for (var sIdx in mapSeries) {
                this._seriesIndexToMapType[sIdx] = mapType;
                this.markAttachStyle[sIdx] = {
                    position: position,
                    _mapType: mapType
                };
                this.buildMark(sIdx);
            }
        },
        getMarkCoord: function (seriesIndex, mpData) {
            return mpData.geoCoord || _geoCoord[mpData.name] ? this.geo2pos(this._seriesIndexToMapType[seriesIndex], mpData.geoCoord || _geoCoord[mpData.name]) : [
                0,
                0
            ];
        },
        getMarkGeo: function (mpData) {
            return mpData.geoCoord || _geoCoord[mpData.name];
        },
        _nameChange: function (mapType, name) {
            return this._nameMap[mapType][name] || name;
        },
        getLabelText: function (name, value, queryTarget, status) {
            var formatter = this.deepQuery(queryTarget, 'itemStyle.' + status + '.label.formatter');
            if (formatter) {
                if (typeof formatter == 'function') {
                    return formatter.call(this.myChart, name, value);
                } else if (typeof formatter == 'string') {
                    formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}');
                    formatter = formatter.replace('{a0}', name).replace('{b0}', value);
                    return formatter;
                }
            } else {
                return name;
            }
        },
        _findMapTypeByPos: function (mx, my) {
            var transform;
            var left;
            var top;
            var width;
            var height;
            for (var mapType in this._mapDataMap) {
                transform = this._mapDataMap[mapType].transform;
                if (!transform || !this._roamMap[mapType] || !this._activeMapType[mapType]) {
                    continue;
                }
                left = transform.left;
                top = transform.top;
                width = transform.width;
                height = transform.height;
                if (mx >= left && mx <= left + width && my >= top && my <= top + height) {
                    return mapType;
                }
            }
            return;
        },
        __onmousewheel: function (params) {
            if (this.shapeList.length <= 0) {
                return;
            }
            var event = params.event;
            var mx = zrEvent.getX(event);
            var my = zrEvent.getY(event);
            var delta;
            var eventDelta = zrEvent.getDelta(event);
            var mapType;
            var mapTypeControl = params.mapTypeControl;
            if (!mapTypeControl) {
                mapTypeControl = {};
                mapType = this._findMapTypeByPos(mx, my);
                if (mapType && this._roamMap[mapType] && this._roamMap[mapType] != 'move') {
                    mapTypeControl[mapType] = true;
                }
            }
            var haveScale = false;
            for (mapType in mapTypeControl) {
                if (mapTypeControl[mapType]) {
                    haveScale = true;
                    var transform = this._mapDataMap[mapType].transform;
                    var left = transform.left;
                    var top = transform.top;
                    var width = transform.width;
                    var height = transform.height;
                    var geoAndPos = this.pos2geo(mapType, [
                        mx - left,
                        my - top
                    ]);
                    if (eventDelta > 0) {
                        delta = 1.2;
                        if (this._scaleLimitMap[mapType].max != null && transform.baseScale >= this._scaleLimitMap[mapType].max) {
                            continue;
                        }
                    } else {
                        delta = 1 / 1.2;
                        if (this._scaleLimitMap[mapType].min != null && transform.baseScale <= this._scaleLimitMap[mapType].min) {
                            continue;
                        }
                    }
                    transform.baseScale *= delta;
                    transform.scale.x *= delta;
                    transform.scale.y *= delta;
                    transform.width = width * delta;
                    transform.height = height * delta;
                    this._mapDataMap[mapType].hasRoam = true;
                    this._mapDataMap[mapType].transform = transform;
                    geoAndPos = this.geo2pos(mapType, geoAndPos);
                    transform.left -= geoAndPos[0] - (mx - left);
                    transform.top -= geoAndPos[1] - (my - top);
                    this._mapDataMap[mapType].transform = transform;
                    this.clearEffectShape(true);
                    for (var i = 0, l = this.shapeList.length; i < l; i++) {
                        if (this.shapeList[i]._mapType == mapType) {
                            this.shapeList[i].position[0] = transform.left;
                            this.shapeList[i].position[1] = transform.top;
                            if (this.shapeList[i].type == 'path' || this.shapeList[i].type == 'symbol' || this.shapeList[i].type == 'circle' || this.shapeList[i].type == 'rectangle' || this.shapeList[i].type == 'polygon' || this.shapeList[i].type == 'line' || this.shapeList[i].type == 'ellipse') {
                                this.shapeList[i].scale[0] *= delta;
                                this.shapeList[i].scale[1] *= delta;
                            } else if (this.shapeList[i].type == 'mark-line') {
                                this.shapeList[i].style.pointListLength = undefined;
                                this.shapeList[i].style.pointList = false;
                                geoAndPos = this.geo2pos(mapType, this.shapeList[i]._geo[0]);
                                this.shapeList[i].style.xStart = geoAndPos[0];
                                this.shapeList[i].style.yStart = geoAndPos[1];
                                geoAndPos = this.geo2pos(mapType, this.shapeList[i]._geo[1]);
                                this.shapeList[i]._x = this.shapeList[i].style.xEnd = geoAndPos[0];
                                this.shapeList[i]._y = this.shapeList[i].style.yEnd = geoAndPos[1];
                            } else if (this.shapeList[i].type == 'icon' || this.shapeList[i].type == 'image') {
                                geoAndPos = this.geo2pos(mapType, this.shapeList[i]._geo);
                                this.shapeList[i].style.x = this.shapeList[i].style._x = geoAndPos[0] - this.shapeList[i].style.width / 2;
                                this.shapeList[i].style.y = this.shapeList[i].style._y = geoAndPos[1] - this.shapeList[i].style.height / 2;
                            } else {
                                geoAndPos = this.geo2pos(mapType, this.shapeList[i]._geo);
                                this.shapeList[i].style.x = geoAndPos[0];
                                this.shapeList[i].style.y = geoAndPos[1];
                                if (this.shapeList[i].type == 'text') {
                                    this.shapeList[i]._style.x = this.shapeList[i].highlightStyle.x = geoAndPos[0];
                                    this.shapeList[i]._style.y = this.shapeList[i].highlightStyle.y = geoAndPos[1];
                                }
                            }
                            this.zr.modShape(this.shapeList[i].id);
                        }
                    }
                }
            }
            if (haveScale) {
                zrEvent.stop(event);
                this.zr.refreshNextFrame();
                var self = this;
                clearTimeout(this._refreshDelayTicket);
                this._refreshDelayTicket = setTimeout(function () {
                    self && self.shapeList && self.animationEffect();
                }, 100);
                this.messageCenter.dispatch(ecConfig.EVENT.MAP_ROAM, params.event, { type: 'scale' }, this.myChart);
            }
        },
        __onmousedown: function (params) {
            if (this.shapeList.length <= 0) {
                return;
            }
            var target = params.target;
            if (target && target.draggable) {
                return;
            }
            var event = params.event;
            var mx = zrEvent.getX(event);
            var my = zrEvent.getY(event);
            var mapType = this._findMapTypeByPos(mx, my);
            if (mapType && this._roamMap[mapType] && this._roamMap[mapType] != 'scale') {
                this._mousedown = true;
                this._mx = mx;
                this._my = my;
                this._curMapType = mapType;
                this.zr.on(zrConfig.EVENT.MOUSEUP, this._onmouseup);
                var self = this;
                setTimeout(function () {
                    self.zr.on(zrConfig.EVENT.MOUSEMOVE, self._onmousemove);
                }, 100);
            }
        },
        __onmousemove: function (params) {
            if (!this._mousedown || !this._isAlive) {
                return;
            }
            var event = params.event;
            var mx = zrEvent.getX(event);
            var my = zrEvent.getY(event);
            var transform = this._mapDataMap[this._curMapType].transform;
            transform.hasRoam = true;
            transform.left -= this._mx - mx;
            transform.top -= this._my - my;
            this._mx = mx;
            this._my = my;
            this._mapDataMap[this._curMapType].transform = transform;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i]._mapType == this._curMapType) {
                    this.shapeList[i].position[0] = transform.left;
                    this.shapeList[i].position[1] = transform.top;
                    this.zr.modShape(this.shapeList[i].id);
                }
            }
            this.messageCenter.dispatch(ecConfig.EVENT.MAP_ROAM, params.event, { type: 'move' }, this.myChart);
            this.clearEffectShape(true);
            this.zr.refreshNextFrame();
            this._justMove = true;
            zrEvent.stop(event);
        },
        __onmouseup: function (params) {
            var event = params.event;
            this._mx = zrEvent.getX(event);
            this._my = zrEvent.getY(event);
            this._mousedown = false;
            var self = this;
            setTimeout(function () {
                self._justMove && self.animationEffect();
                self._justMove = false;
                self.zr.un(zrConfig.EVENT.MOUSEMOVE, self._onmousemove);
                self.zr.un(zrConfig.EVENT.MOUSEUP, self._onmouseup);
            }, 120);
        },
        __onroamcontroller: function (params) {
            var event = params.event;
            event.zrenderX = this.zr.getWidth() / 2;
            event.zrenderY = this.zr.getHeight() / 2;
            var mapTypeControl = params.mapTypeControl;
            var top = 0;
            var left = 0;
            var step = params.step;
            switch (params.roamType) {
            case 'scaleUp':
                event.zrenderDelta = 1;
                this.__onmousewheel({
                    event: event,
                    mapTypeControl: mapTypeControl
                });
                return;
            case 'scaleDown':
                event.zrenderDelta = -1;
                this.__onmousewheel({
                    event: event,
                    mapTypeControl: mapTypeControl
                });
                return;
            case 'up':
                top = -step;
                break;
            case 'down':
                top = step;
                break;
            case 'left':
                left = -step;
                break;
            case 'right':
                left = step;
                break;
            }
            var transform;
            var curMapType;
            for (curMapType in mapTypeControl) {
                if (!this._mapDataMap[curMapType] || !this._activeMapType[curMapType]) {
                    continue;
                }
                transform = this._mapDataMap[curMapType].transform;
                transform.hasRoam = true;
                transform.left -= left;
                transform.top -= top;
                this._mapDataMap[curMapType].transform = transform;
            }
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                curMapType = this.shapeList[i]._mapType;
                if (!mapTypeControl[curMapType] || !this._activeMapType[curMapType]) {
                    continue;
                }
                transform = this._mapDataMap[curMapType].transform;
                this.shapeList[i].position[0] = transform.left;
                this.shapeList[i].position[1] = transform.top;
                this.zr.modShape(this.shapeList[i].id);
            }
            this.messageCenter.dispatch(ecConfig.EVENT.MAP_ROAM, params.event, { type: 'move' }, this.myChart);
            this.clearEffectShape(true);
            this.zr.refreshNextFrame();
            clearTimeout(this.dircetionTimer);
            var self = this;
            this.dircetionTimer = setTimeout(function () {
                self.animationEffect();
            }, 150);
        },
        __ondrhoverlink: function (param) {
            var curMapType;
            var value;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                curMapType = this.shapeList[i]._mapType;
                if (!this._hoverLinkMap[curMapType] || !this._activeMapType[curMapType]) {
                    continue;
                }
                value = ecData.get(this.shapeList[i], 'value');
                if (value != null && value >= param.valueMin && value <= param.valueMax) {
                    this.zr.addHoverShape(this.shapeList[i]);
                }
            }
        },
        onclick: function (params) {
            if (!this.isClick || !params.target || this._justMove || params.target.type == 'icon') {
                return;
            }
            this.isClick = false;
            var target = params.target;
            var name = target.style._name;
            var len = this.shapeList.length;
            var mapType = target._mapType || '';
            if (this._selectedMode[mapType] == 'single') {
                for (var p in this._selected) {
                    if (this._selected[p] && this._mapTypeMap[p] == mapType) {
                        for (var i = 0; i < len; i++) {
                            if (this.shapeList[i].style._name == p && this.shapeList[i]._mapType == mapType) {
                                this.shapeList[i].style = this.shapeList[i]._style;
                                this.zr.modShape(this.shapeList[i].id);
                            }
                        }
                        p != name && (this._selected[p] = false);
                    }
                }
            }
            this._selected[name] = !this._selected[name];
            for (var i = 0; i < len; i++) {
                if (this.shapeList[i].style._name == name && this.shapeList[i]._mapType == mapType) {
                    if (this._selected[name]) {
                        this.shapeList[i].style = this.shapeList[i].highlightStyle;
                    } else {
                        this.shapeList[i].style = this.shapeList[i]._style;
                    }
                    this.zr.modShape(this.shapeList[i].id);
                }
            }
            this.messageCenter.dispatch(ecConfig.EVENT.MAP_SELECTED, params.event, {
                selected: this._selected,
                target: name
            }, this.myChart);
            this.zr.refreshNextFrame();
            var self = this;
            setTimeout(function () {
                self.zr.trigger(zrConfig.EVENT.MOUSEMOVE, params.event);
            }, 100);
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.series = newOption.series;
            }
            if (this._mapDataRequireCounter > 0) {
                this.clear();
            } else {
                this.backupShapeList();
            }
            this._buildShape();
            this.zr.refreshHover();
        },
        ondataRange: function (param, status) {
            if (this.component.dataRange) {
                this.refresh();
                status.needRefresh = true;
            }
            return;
        },
        pos2geo: function (mapType, p) {
            if (!this._mapDataMap[mapType].transform) {
                return null;
            }
            return this._mapDataMap[mapType].projection.pos2geo(this._mapDataMap[mapType].transform, p);
        },
        getGeoByPos: function (mapType, p) {
            if (!this._mapDataMap[mapType].transform) {
                return null;
            }
            var position = [
                this._mapDataMap[mapType].transform.left,
                this._mapDataMap[mapType].transform.top
            ];
            if (p instanceof Array) {
                p[0] -= position[0];
                p[1] -= position[1];
            } else {
                p.x -= position[0];
                p.y -= position[1];
            }
            return this.pos2geo(mapType, p);
        },
        geo2pos: function (mapType, p) {
            if (!this._mapDataMap[mapType].transform) {
                return null;
            }
            return this._mapDataMap[mapType].projection.geo2pos(this._mapDataMap[mapType].transform, p);
        },
        getPosByGeo: function (mapType, p) {
            if (!this._mapDataMap[mapType].transform) {
                return null;
            }
            var pos = this.geo2pos(mapType, p);
            pos[0] += this._mapDataMap[mapType].transform.left;
            pos[1] += this._mapDataMap[mapType].transform.top;
            return pos;
        },
        getMapPosition: function (mapType) {
            if (!this._mapDataMap[mapType].transform) {
                return null;
            }
            return [
                this._mapDataMap[mapType].transform.left,
                this._mapDataMap[mapType].transform.top
            ];
        },
        onbeforDispose: function () {
            this._isAlive = false;
            this.zr.un(zrConfig.EVENT.MOUSEWHEEL, this._onmousewheel);
            this.zr.un(zrConfig.EVENT.MOUSEDOWN, this._onmousedown);
            this.messageCenter.unbind(ecConfig.EVENT.ROAMCONTROLLER, this._onroamcontroller);
            this.messageCenter.unbind(ecConfig.EVENT.DATA_RANGE_HOVERLINK, this._ondrhoverlink);
        }
    };
    zrUtil.inherits(Map, ChartBase);
    require('../chart').define('map', Map);
    return Map;
});define('zrender/shape/Path', [
    'require',
    './Base',
    './util/PathProxy',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var PathProxy = require('./util/PathProxy');
    var PathSegment = PathProxy.PathSegment;
    var vMag = function (v) {
        return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    };
    var vRatio = function (u, v) {
        return (u[0] * v[0] + u[1] * v[1]) / (vMag(u) * vMag(v));
    };
    var vAngle = function (u, v) {
        return (u[0] * v[1] < u[1] * v[0] ? -1 : 1) * Math.acos(vRatio(u, v));
    };
    var Path = function (options) {
        Base.call(this, options);
    };
    Path.prototype = {
        type: 'path',
        buildPathArray: function (data, x, y) {
            if (!data) {
                return [];
            }
            x = x || 0;
            y = y || 0;
            var cs = data;
            var cc = [
                'm',
                'M',
                'l',
                'L',
                'v',
                'V',
                'h',
                'H',
                'z',
                'Z',
                'c',
                'C',
                'q',
                'Q',
                't',
                'T',
                's',
                'S',
                'a',
                'A'
            ];
            cs = cs.replace(/-/g, ' -');
            cs = cs.replace(/  /g, ' ');
            cs = cs.replace(/ /g, ',');
            cs = cs.replace(/,,/g, ',');
            var n;
            for (n = 0; n < cc.length; n++) {
                cs = cs.replace(new RegExp(cc[n], 'g'), '|' + cc[n]);
            }
            var arr = cs.split('|');
            var ca = [];
            var cpx = 0;
            var cpy = 0;
            for (n = 1; n < arr.length; n++) {
                var str = arr[n];
                var c = str.charAt(0);
                str = str.slice(1);
                str = str.replace(new RegExp('e,-', 'g'), 'e-');
                var p = str.split(',');
                if (p.length > 0 && p[0] === '') {
                    p.shift();
                }
                for (var i = 0; i < p.length; i++) {
                    p[i] = parseFloat(p[i]);
                }
                while (p.length > 0) {
                    if (isNaN(p[0])) {
                        break;
                    }
                    var cmd = null;
                    var points = [];
                    var ctlPtx;
                    var ctlPty;
                    var prevCmd;
                    var rx;
                    var ry;
                    var psi;
                    var fa;
                    var fs;
                    var x1 = cpx;
                    var y1 = cpy;
                    switch (c) {
                    case 'l':
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'L';
                        points.push(cpx, cpy);
                        break;
                    case 'L':
                        cpx = p.shift();
                        cpy = p.shift();
                        points.push(cpx, cpy);
                        break;
                    case 'm':
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'M';
                        points.push(cpx, cpy);
                        c = 'l';
                        break;
                    case 'M':
                        cpx = p.shift();
                        cpy = p.shift();
                        cmd = 'M';
                        points.push(cpx, cpy);
                        c = 'L';
                        break;
                    case 'h':
                        cpx += p.shift();
                        cmd = 'L';
                        points.push(cpx, cpy);
                        break;
                    case 'H':
                        cpx = p.shift();
                        cmd = 'L';
                        points.push(cpx, cpy);
                        break;
                    case 'v':
                        cpy += p.shift();
                        cmd = 'L';
                        points.push(cpx, cpy);
                        break;
                    case 'V':
                        cpy = p.shift();
                        cmd = 'L';
                        points.push(cpx, cpy);
                        break;
                    case 'C':
                        points.push(p.shift(), p.shift(), p.shift(), p.shift());
                        cpx = p.shift();
                        cpy = p.shift();
                        points.push(cpx, cpy);
                        break;
                    case 'c':
                        points.push(cpx + p.shift(), cpy + p.shift(), cpx + p.shift(), cpy + p.shift());
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'C';
                        points.push(cpx, cpy);
                        break;
                    case 'S':
                        ctlPtx = cpx;
                        ctlPty = cpy;
                        prevCmd = ca[ca.length - 1];
                        if (prevCmd.command === 'C') {
                            ctlPtx = cpx + (cpx - prevCmd.points[2]);
                            ctlPty = cpy + (cpy - prevCmd.points[3]);
                        }
                        points.push(ctlPtx, ctlPty, p.shift(), p.shift());
                        cpx = p.shift();
                        cpy = p.shift();
                        cmd = 'C';
                        points.push(cpx, cpy);
                        break;
                    case 's':
                        ctlPtx = cpx, ctlPty = cpy;
                        prevCmd = ca[ca.length - 1];
                        if (prevCmd.command === 'C') {
                            ctlPtx = cpx + (cpx - prevCmd.points[2]);
                            ctlPty = cpy + (cpy - prevCmd.points[3]);
                        }
                        points.push(ctlPtx, ctlPty, cpx + p.shift(), cpy + p.shift());
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'C';
                        points.push(cpx, cpy);
                        break;
                    case 'Q':
                        points.push(p.shift(), p.shift());
                        cpx = p.shift();
                        cpy = p.shift();
                        points.push(cpx, cpy);
                        break;
                    case 'q':
                        points.push(cpx + p.shift(), cpy + p.shift());
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'Q';
                        points.push(cpx, cpy);
                        break;
                    case 'T':
                        ctlPtx = cpx, ctlPty = cpy;
                        prevCmd = ca[ca.length - 1];
                        if (prevCmd.command === 'Q') {
                            ctlPtx = cpx + (cpx - prevCmd.points[0]);
                            ctlPty = cpy + (cpy - prevCmd.points[1]);
                        }
                        cpx = p.shift();
                        cpy = p.shift();
                        cmd = 'Q';
                        points.push(ctlPtx, ctlPty, cpx, cpy);
                        break;
                    case 't':
                        ctlPtx = cpx, ctlPty = cpy;
                        prevCmd = ca[ca.length - 1];
                        if (prevCmd.command === 'Q') {
                            ctlPtx = cpx + (cpx - prevCmd.points[0]);
                            ctlPty = cpy + (cpy - prevCmd.points[1]);
                        }
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'Q';
                        points.push(ctlPtx, ctlPty, cpx, cpy);
                        break;
                    case 'A':
                        rx = p.shift();
                        ry = p.shift();
                        psi = p.shift();
                        fa = p.shift();
                        fs = p.shift();
                        x1 = cpx, y1 = cpy;
                        cpx = p.shift(), cpy = p.shift();
                        cmd = 'A';
                        points = this._convertPoint(x1, y1, cpx, cpy, fa, fs, rx, ry, psi);
                        break;
                    case 'a':
                        rx = p.shift();
                        ry = p.shift();
                        psi = p.shift();
                        fa = p.shift();
                        fs = p.shift();
                        x1 = cpx, y1 = cpy;
                        cpx += p.shift();
                        cpy += p.shift();
                        cmd = 'A';
                        points = this._convertPoint(x1, y1, cpx, cpy, fa, fs, rx, ry, psi);
                        break;
                    }
                    for (var j = 0, l = points.length; j < l; j += 2) {
                        points[j] += x;
                        points[j + 1] += y;
                    }
                    ca.push(new PathSegment(cmd || c, points));
                }
                if (c === 'z' || c === 'Z') {
                    ca.push(new PathSegment('z', []));
                }
            }
            return ca;
        },
        _convertPoint: function (x1, y1, x2, y2, fa, fs, rx, ry, psiDeg) {
            var psi = psiDeg * (Math.PI / 180);
            var xp = Math.cos(psi) * (x1 - x2) / 2 + Math.sin(psi) * (y1 - y2) / 2;
            var yp = -1 * Math.sin(psi) * (x1 - x2) / 2 + Math.cos(psi) * (y1 - y2) / 2;
            var lambda = xp * xp / (rx * rx) + yp * yp / (ry * ry);
            if (lambda > 1) {
                rx *= Math.sqrt(lambda);
                ry *= Math.sqrt(lambda);
            }
            var f = Math.sqrt((rx * rx * (ry * ry) - rx * rx * (yp * yp) - ry * ry * (xp * xp)) / (rx * rx * (yp * yp) + ry * ry * (xp * xp)));
            if (fa === fs) {
                f *= -1;
            }
            if (isNaN(f)) {
                f = 0;
            }
            var cxp = f * rx * yp / ry;
            var cyp = f * -ry * xp / rx;
            var cx = (x1 + x2) / 2 + Math.cos(psi) * cxp - Math.sin(psi) * cyp;
            var cy = (y1 + y2) / 2 + Math.sin(psi) * cxp + Math.cos(psi) * cyp;
            var theta = vAngle([
                1,
                0
            ], [
                (xp - cxp) / rx,
                (yp - cyp) / ry
            ]);
            var u = [
                (xp - cxp) / rx,
                (yp - cyp) / ry
            ];
            var v = [
                (-1 * xp - cxp) / rx,
                (-1 * yp - cyp) / ry
            ];
            var dTheta = vAngle(u, v);
            if (vRatio(u, v) <= -1) {
                dTheta = Math.PI;
            }
            if (vRatio(u, v) >= 1) {
                dTheta = 0;
            }
            if (fs === 0 && dTheta > 0) {
                dTheta = dTheta - 2 * Math.PI;
            }
            if (fs === 1 && dTheta < 0) {
                dTheta = dTheta + 2 * Math.PI;
            }
            return [
                cx,
                cy,
                rx,
                ry,
                theta,
                dTheta,
                psi,
                fs
            ];
        },
        buildPath: function (ctx, style) {
            var path = style.path;
            var x = style.x || 0;
            var y = style.y || 0;
            style.pathArray = style.pathArray || this.buildPathArray(path, x, y);
            var pathArray = style.pathArray;
            var pointList = style.pointList = [];
            var singlePointList = [];
            for (var i = 0, l = pathArray.length; i < l; i++) {
                if (pathArray[i].command.toUpperCase() == 'M') {
                    singlePointList.length > 0 && pointList.push(singlePointList);
                    singlePointList = [];
                }
                var p = pathArray[i].points;
                for (var j = 0, k = p.length; j < k; j += 2) {
                    singlePointList.push([
                        p[j],
                        p[j + 1]
                    ]);
                }
            }
            singlePointList.length > 0 && pointList.push(singlePointList);
            for (var i = 0, l = pathArray.length; i < l; i++) {
                var c = pathArray[i].command;
                var p = pathArray[i].points;
                switch (c) {
                case 'L':
                    ctx.lineTo(p[0], p[1]);
                    break;
                case 'M':
                    ctx.moveTo(p[0], p[1]);
                    break;
                case 'C':
                    ctx.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
                    break;
                case 'Q':
                    ctx.quadraticCurveTo(p[0], p[1], p[2], p[3]);
                    break;
                case 'A':
                    var cx = p[0];
                    var cy = p[1];
                    var rx = p[2];
                    var ry = p[3];
                    var theta = p[4];
                    var dTheta = p[5];
                    var psi = p[6];
                    var fs = p[7];
                    var r = rx > ry ? rx : ry;
                    var scaleX = rx > ry ? 1 : rx / ry;
                    var scaleY = rx > ry ? ry / rx : 1;
                    ctx.translate(cx, cy);
                    ctx.rotate(psi);
                    ctx.scale(scaleX, scaleY);
                    ctx.arc(0, 0, r, theta, theta + dTheta, 1 - fs);
                    ctx.scale(1 / scaleX, 1 / scaleY);
                    ctx.rotate(-psi);
                    ctx.translate(-cx, -cy);
                    break;
                case 'z':
                    ctx.closePath();
                    break;
                }
            }
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            var minX = Number.MAX_VALUE;
            var maxX = Number.MIN_VALUE;
            var minY = Number.MAX_VALUE;
            var maxY = Number.MIN_VALUE;
            var x = style.x || 0;
            var y = style.y || 0;
            var pathArray = style.pathArray || this.buildPathArray(style.path);
            for (var i = 0; i < pathArray.length; i++) {
                var p = pathArray[i].points;
                for (var j = 0; j < p.length; j++) {
                    if (j % 2 === 0) {
                        if (p[j] + x < minX) {
                            minX = p[j];
                        }
                        if (p[j] + x > maxX) {
                            maxX = p[j];
                        }
                    } else {
                        if (p[j] + y < minY) {
                            minY = p[j];
                        }
                        if (p[j] + y > maxY) {
                            maxY = p[j];
                        }
                    }
                }
            }
            var rect;
            if (minX === Number.MAX_VALUE || maxX === Number.MIN_VALUE || minY === Number.MAX_VALUE || maxY === Number.MIN_VALUE) {
                rect = {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 0
                };
            } else {
                rect = {
                    x: Math.round(minX - lineWidth / 2),
                    y: Math.round(minY - lineWidth / 2),
                    width: maxX - minX + lineWidth,
                    height: maxY - minY + lineWidth
                };
            }
            style.__rect = rect;
            return rect;
        }
    };
    require('../tool/util').inherits(Path, Base);
    return Path;
});define('zrender/shape/Ellipse', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var Ellipse = function (options) {
        Base.call(this, options);
    };
    Ellipse.prototype = {
        type: 'ellipse',
        buildPath: function (ctx, style) {
            var k = 0.5522848;
            var x = style.x;
            var y = style.y;
            var a = style.a;
            var b = style.b;
            var ox = a * k;
            var oy = b * k;
            ctx.moveTo(x - a, y);
            ctx.bezierCurveTo(x - a, y - oy, x - ox, y - b, x, y - b);
            ctx.bezierCurveTo(x + ox, y - b, x + a, y - oy, x + a, y);
            ctx.bezierCurveTo(x + a, y + oy, x + ox, y + b, x, y + b);
            ctx.bezierCurveTo(x - ox, y + b, x - a, y + oy, x - a, y);
            ctx.closePath();
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - style.a - lineWidth / 2),
                y: Math.round(style.y - style.b - lineWidth / 2),
                width: style.a * 2 + lineWidth,
                height: style.b * 2 + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Ellipse, Base);
    return Ellipse;
});define('echarts/component/dataRange', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Rectangle',
    '../util/shape/HandlePolygon',
    '../config',
    'zrender/tool/util',
    'zrender/tool/event',
    'zrender/tool/area',
    'zrender/tool/color',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var RectangleShape = require('zrender/shape/Rectangle');
    var HandlePolygonShape = require('../util/shape/HandlePolygon');
    var ecConfig = require('../config');
    ecConfig.dataRange = {
        zlevel: 0,
        z: 4,
        show: true,
        orient: 'vertical',
        x: 'left',
        y: 'bottom',
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 1,
        itemGap: 15,
        itemWidth: 25,
        itemHeight: 25,
        precision: 0,
        splitNumber: 5,
        calculable: false,
        selectedMode: true,
        hoverLink: true,
        realtime: true,
        color: [
            '#006edd',
            '#e0ffff'
        ],
        textStyle: {
            fontSize: 18,
            color: '#333'
        }
    };
    var zrUtil = require('zrender/tool/util');
    var zrEvent = require('zrender/tool/event');
    var zrArea = require('zrender/tool/area');
    var zrColor = require('zrender/tool/color');
    function DataRange(ecTheme, messageCenter, zr, option, myChart) {
        if (typeof this.query(option, 'dataRange.min') == 'undefined' || typeof this.query(option, 'dataRange.max') == 'undefined') {
            console.error('option.dataRange.min or option.dataRange.max has not been defined.');
            return;
        }
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._ondrift = function (dx, dy) {
            return self.__ondrift(this, dx, dy);
        };
        self._ondragend = function () {
            return self.__ondragend();
        };
        self._dataRangeSelected = function (param) {
            return self.__dataRangeSelected(param);
        };
        self._dispatchHoverLink = function (param) {
            return self.__dispatchHoverLink(param);
        };
        self._onhoverlink = function (params) {
            return self.__onhoverlink(params);
        };
        this._selectedMap = {};
        this._range = {};
        this.refresh(option);
        messageCenter.bind(ecConfig.EVENT.HOVER, this._onhoverlink);
    }
    DataRange.prototype = {
        type: ecConfig.COMPONENT_TYPE_DATARANGE,
        _textGap: 10,
        _buildShape: function () {
            this._itemGroupLocation = this._getItemGroupLocation();
            this._buildBackground();
            if (this.dataRangeOption.splitNumber <= 0 || this.dataRangeOption.calculable) {
                this._buildGradient();
            } else {
                this._buildItem();
            }
            if (this.dataRangeOption.show) {
                for (var i = 0, l = this.shapeList.length; i < l; i++) {
                    this.zr.addShape(this.shapeList[i]);
                }
            }
            this._syncShapeFromRange();
        },
        _buildItem: function () {
            var data = this._valueTextList;
            var dataLength = data.length;
            var itemName;
            var itemShape;
            var textShape;
            var font = this.getFont(this.dataRangeOption.textStyle);
            var lastX = this._itemGroupLocation.x;
            var lastY = this._itemGroupLocation.y;
            var itemWidth = this.dataRangeOption.itemWidth;
            var itemHeight = this.dataRangeOption.itemHeight;
            var itemGap = this.dataRangeOption.itemGap;
            var textHeight = zrArea.getTextHeight('国', font);
            var color;
            if (this.dataRangeOption.orient == 'vertical' && this.dataRangeOption.x == 'right') {
                lastX = this._itemGroupLocation.x + this._itemGroupLocation.width - itemWidth;
            }
            var needValueText = true;
            if (this.dataRangeOption.text) {
                needValueText = false;
                if (this.dataRangeOption.text[0]) {
                    textShape = this._getTextShape(lastX, lastY, this.dataRangeOption.text[0]);
                    if (this.dataRangeOption.orient == 'horizontal') {
                        lastX += zrArea.getTextWidth(this.dataRangeOption.text[0], font) + this._textGap;
                    } else {
                        lastY += textHeight + this._textGap;
                        textShape.style.y += textHeight / 2 + this._textGap;
                        textShape.style.textBaseline = 'bottom';
                    }
                    this.shapeList.push(new TextShape(textShape));
                }
            }
            for (var i = 0; i < dataLength; i++) {
                itemName = data[i];
                color = this.getColorByIndex(i);
                itemShape = this._getItemShape(lastX, lastY, itemWidth, itemHeight, this._selectedMap[i] ? color : '#ccc');
                itemShape._idx = i;
                itemShape.onmousemove = this._dispatchHoverLink;
                if (this.dataRangeOption.selectedMode) {
                    itemShape.clickable = true;
                    itemShape.onclick = this._dataRangeSelected;
                }
                this.shapeList.push(new RectangleShape(itemShape));
                if (needValueText) {
                    textShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        style: {
                            x: lastX + itemWidth + 5,
                            y: lastY,
                            color: this._selectedMap[i] ? this.dataRangeOption.textStyle.color : '#ccc',
                            text: data[i],
                            textFont: font,
                            textBaseline: 'top'
                        },
                        highlightStyle: { brushType: 'fill' }
                    };
                    if (this.dataRangeOption.orient == 'vertical' && this.dataRangeOption.x == 'right') {
                        textShape.style.x -= itemWidth + 10;
                        textShape.style.textAlign = 'right';
                    }
                    textShape._idx = i;
                    textShape.onmousemove = this._dispatchHoverLink;
                    if (this.dataRangeOption.selectedMode) {
                        textShape.clickable = true;
                        textShape.onclick = this._dataRangeSelected;
                    }
                    this.shapeList.push(new TextShape(textShape));
                }
                if (this.dataRangeOption.orient == 'horizontal') {
                    lastX += itemWidth + (needValueText ? 5 : 0) + (needValueText ? zrArea.getTextWidth(itemName, font) : 0) + itemGap;
                } else {
                    lastY += itemHeight + itemGap;
                }
            }
            if (!needValueText && this.dataRangeOption.text[1]) {
                if (this.dataRangeOption.orient == 'horizontal') {
                    lastX = lastX - itemGap + this._textGap;
                } else {
                    lastY = lastY - itemGap + this._textGap;
                }
                textShape = this._getTextShape(lastX, lastY, this.dataRangeOption.text[1]);
                if (this.dataRangeOption.orient != 'horizontal') {
                    textShape.style.y -= 5;
                    textShape.style.textBaseline = 'top';
                }
                this.shapeList.push(new TextShape(textShape));
            }
        },
        _buildGradient: function () {
            var itemShape;
            var textShape;
            var font = this.getFont(this.dataRangeOption.textStyle);
            var lastX = this._itemGroupLocation.x;
            var lastY = this._itemGroupLocation.y;
            var itemWidth = this.dataRangeOption.itemWidth;
            var itemHeight = this.dataRangeOption.itemHeight;
            var textHeight = zrArea.getTextHeight('国', font);
            var mSize = 6;
            var needValueText = true;
            if (this.dataRangeOption.text) {
                needValueText = false;
                if (this.dataRangeOption.text[0]) {
                    textShape = this._getTextShape(lastX, lastY, this.dataRangeOption.text[0]);
                    if (this.dataRangeOption.orient == 'horizontal') {
                        lastX += zrArea.getTextWidth(this.dataRangeOption.text[0], font) + this._textGap;
                    } else {
                        lastY += textHeight + this._textGap;
                        textShape.style.y += textHeight / 2 + this._textGap;
                        textShape.style.textBaseline = 'bottom';
                    }
                    this.shapeList.push(new TextShape(textShape));
                }
            }
            var zrColor = require('zrender/tool/color');
            var per = 1 / (this.dataRangeOption.color.length - 1);
            var colorList = [];
            for (var i = 0, l = this.dataRangeOption.color.length; i < l; i++) {
                colorList.push([
                    i * per,
                    this.dataRangeOption.color[i]
                ]);
            }
            if (this.dataRangeOption.orient == 'horizontal') {
                itemShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    style: {
                        x: lastX,
                        y: lastY,
                        width: itemWidth * mSize,
                        height: itemHeight,
                        color: zrColor.getLinearGradient(lastX, lastY, lastX + itemWidth * mSize, lastY, colorList)
                    },
                    hoverable: false
                };
                lastX += itemWidth * mSize + this._textGap;
            } else {
                itemShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    style: {
                        x: lastX,
                        y: lastY,
                        width: itemWidth,
                        height: itemHeight * mSize,
                        color: zrColor.getLinearGradient(lastX, lastY, lastX, lastY + itemHeight * mSize, colorList)
                    },
                    hoverable: false
                };
                lastY += itemHeight * mSize + this._textGap;
            }
            this.shapeList.push(new RectangleShape(itemShape));
            this._calculableLocation = itemShape.style;
            if (this.dataRangeOption.calculable) {
                this._buildFiller();
                this._bulidMask();
                this._bulidHandle();
            }
            this._buildIndicator();
            if (!needValueText && this.dataRangeOption.text[1]) {
                textShape = this._getTextShape(lastX, lastY, this.dataRangeOption.text[1]);
                this.shapeList.push(new TextShape(textShape));
            }
        },
        _buildIndicator: function () {
            var x = this._calculableLocation.x;
            var y = this._calculableLocation.y;
            var width = this._calculableLocation.width;
            var height = this._calculableLocation.height;
            var size = 5;
            var pointList;
            var textPosition;
            if (this.dataRangeOption.orient == 'horizontal') {
                if (this.dataRangeOption.y != 'bottom') {
                    pointList = [
                        [
                            x,
                            y + height
                        ],
                        [
                            x - size,
                            y + height + size
                        ],
                        [
                            x + size,
                            y + height + size
                        ]
                    ];
                    textPosition = 'bottom';
                } else {
                    pointList = [
                        [
                            x,
                            y
                        ],
                        [
                            x - size,
                            y - size
                        ],
                        [
                            x + size,
                            y - size
                        ]
                    ];
                    textPosition = 'top';
                }
            } else {
                if (this.dataRangeOption.x != 'right') {
                    pointList = [
                        [
                            x + width,
                            y
                        ],
                        [
                            x + width + size,
                            y - size
                        ],
                        [
                            x + width + size,
                            y + size
                        ]
                    ];
                    textPosition = 'right';
                } else {
                    pointList = [
                        [
                            x,
                            y
                        ],
                        [
                            x - size,
                            y - size
                        ],
                        [
                            x - size,
                            y + size
                        ]
                    ];
                    textPosition = 'left';
                }
            }
            this._indicatorShape = {
                style: {
                    pointList: pointList,
                    color: '#fff',
                    __rect: {
                        x: Math.min(pointList[0][0], pointList[1][0]),
                        y: Math.min(pointList[0][1], pointList[1][1]),
                        width: size * (this.dataRangeOption.orient == 'horizontal' ? 2 : 1),
                        height: size * (this.dataRangeOption.orient == 'horizontal' ? 1 : 2)
                    }
                },
                highlightStyle: {
                    brushType: 'fill',
                    textPosition: textPosition,
                    textColor: this.dataRangeOption.textStyle.color
                },
                hoverable: false
            };
            this._indicatorShape = new HandlePolygonShape(this._indicatorShape);
        },
        _buildFiller: function () {
            this._fillerShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase() + 1,
                style: {
                    x: this._calculableLocation.x,
                    y: this._calculableLocation.y,
                    width: this._calculableLocation.width,
                    height: this._calculableLocation.height,
                    color: 'rgba(255,255,255,0)'
                },
                highlightStyle: {
                    strokeColor: 'rgba(255,255,255,0.5)',
                    lineWidth: 1
                },
                draggable: true,
                ondrift: this._ondrift,
                ondragend: this._ondragend,
                onmousemove: this._dispatchHoverLink,
                _type: 'filler'
            };
            this._fillerShape = new RectangleShape(this._fillerShape);
            this.shapeList.push(this._fillerShape);
        },
        _bulidHandle: function () {
            var x = this._calculableLocation.x;
            var y = this._calculableLocation.y;
            var width = this._calculableLocation.width;
            var height = this._calculableLocation.height;
            var font = this.getFont(this.dataRangeOption.textStyle);
            var textHeight = zrArea.getTextHeight('国', font);
            var textWidth = Math.max(zrArea.getTextWidth(this._textFormat(this.dataRangeOption.max), font), zrArea.getTextWidth(this._textFormat(this.dataRangeOption.min), font)) + 2;
            var pointListStart;
            var textXStart;
            var textYStart;
            var coverRectStart;
            var pointListEnd;
            var textXEnd;
            var textYEnd;
            var coverRectEnd;
            if (this.dataRangeOption.orient == 'horizontal') {
                if (this.dataRangeOption.y != 'bottom') {
                    pointListStart = [
                        [
                            x,
                            y
                        ],
                        [
                            x,
                            y + height + textHeight
                        ],
                        [
                            x - textHeight,
                            y + height + textHeight
                        ],
                        [
                            x - 1,
                            y + height
                        ],
                        [
                            x - 1,
                            y
                        ]
                    ];
                    textXStart = x - textWidth / 2 - textHeight;
                    textYStart = y + height + textHeight / 2 + 2;
                    coverRectStart = {
                        x: x - textWidth - textHeight,
                        y: y + height,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                    pointListEnd = [
                        [
                            x + width,
                            y
                        ],
                        [
                            x + width,
                            y + height + textHeight
                        ],
                        [
                            x + width + textHeight,
                            y + height + textHeight
                        ],
                        [
                            x + width + 1,
                            y + height
                        ],
                        [
                            x + width + 1,
                            y
                        ]
                    ];
                    textXEnd = x + width + textWidth / 2 + textHeight;
                    textYEnd = textYStart;
                    coverRectEnd = {
                        x: x + width,
                        y: y + height,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                } else {
                    pointListStart = [
                        [
                            x,
                            y + height
                        ],
                        [
                            x,
                            y - textHeight
                        ],
                        [
                            x - textHeight,
                            y - textHeight
                        ],
                        [
                            x - 1,
                            y
                        ],
                        [
                            x - 1,
                            y + height
                        ]
                    ];
                    textXStart = x - textWidth / 2 - textHeight;
                    textYStart = y - textHeight / 2 - 2;
                    coverRectStart = {
                        x: x - textWidth - textHeight,
                        y: y - textHeight,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                    pointListEnd = [
                        [
                            x + width,
                            y + height
                        ],
                        [
                            x + width,
                            y - textHeight
                        ],
                        [
                            x + width + textHeight,
                            y - textHeight
                        ],
                        [
                            x + width + 1,
                            y
                        ],
                        [
                            x + width + 1,
                            y + height
                        ]
                    ];
                    textXEnd = x + width + textWidth / 2 + textHeight;
                    textYEnd = textYStart;
                    coverRectEnd = {
                        x: x + width,
                        y: y - textHeight,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                }
            } else {
                textWidth += textHeight;
                if (this.dataRangeOption.x != 'right') {
                    pointListStart = [
                        [
                            x,
                            y
                        ],
                        [
                            x + width + textHeight,
                            y
                        ],
                        [
                            x + width + textHeight,
                            y - textHeight
                        ],
                        [
                            x + width,
                            y - 1
                        ],
                        [
                            x,
                            y - 1
                        ]
                    ];
                    textXStart = x + width + textWidth / 2 + textHeight / 2;
                    textYStart = y - textHeight / 2;
                    coverRectStart = {
                        x: x + width,
                        y: y - textHeight,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                    pointListEnd = [
                        [
                            x,
                            y + height
                        ],
                        [
                            x + width + textHeight,
                            y + height
                        ],
                        [
                            x + width + textHeight,
                            y + textHeight + height
                        ],
                        [
                            x + width,
                            y + 1 + height
                        ],
                        [
                            x,
                            y + height + 1
                        ]
                    ];
                    textXEnd = textXStart;
                    textYEnd = y + height + textHeight / 2;
                    coverRectEnd = {
                        x: x + width,
                        y: y + height,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                } else {
                    pointListStart = [
                        [
                            x + width,
                            y
                        ],
                        [
                            x - textHeight,
                            y
                        ],
                        [
                            x - textHeight,
                            y - textHeight
                        ],
                        [
                            x,
                            y - 1
                        ],
                        [
                            x + width,
                            y - 1
                        ]
                    ];
                    textXStart = x - textWidth / 2 - textHeight / 2;
                    textYStart = y - textHeight / 2;
                    coverRectStart = {
                        x: x - textWidth - textHeight,
                        y: y - textHeight,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                    pointListEnd = [
                        [
                            x + width,
                            y + height
                        ],
                        [
                            x - textHeight,
                            y + height
                        ],
                        [
                            x - textHeight,
                            y + textHeight + height
                        ],
                        [
                            x,
                            y + 1 + height
                        ],
                        [
                            x + width,
                            y + height + 1
                        ]
                    ];
                    textXEnd = textXStart;
                    textYEnd = y + height + textHeight / 2;
                    coverRectEnd = {
                        x: x - textWidth - textHeight,
                        y: y + height,
                        width: textWidth + textHeight,
                        height: textHeight
                    };
                }
            }
            this._startShape = {
                style: {
                    pointList: pointListStart,
                    text: this._textFormat(this.dataRangeOption.max),
                    textX: textXStart,
                    textY: textYStart,
                    textFont: font,
                    color: this.getColor(this.dataRangeOption.max),
                    rect: coverRectStart,
                    x: pointListStart[0][0],
                    y: pointListStart[0][1],
                    _x: pointListStart[0][0],
                    _y: pointListStart[0][1]
                }
            };
            this._startShape.highlightStyle = {
                strokeColor: this._startShape.style.color,
                lineWidth: 1
            };
            this._endShape = {
                style: {
                    pointList: pointListEnd,
                    text: this._textFormat(this.dataRangeOption.min),
                    textX: textXEnd,
                    textY: textYEnd,
                    textFont: font,
                    color: this.getColor(this.dataRangeOption.min),
                    rect: coverRectEnd,
                    x: pointListEnd[0][0],
                    y: pointListEnd[0][1],
                    _x: pointListEnd[0][0],
                    _y: pointListEnd[0][1]
                }
            };
            this._endShape.highlightStyle = {
                strokeColor: this._endShape.style.color,
                lineWidth: 1
            };
            this._startShape.zlevel = this._endShape.zlevel = this.getZlevelBase();
            this._startShape.z = this._endShape.z = this.getZBase() + 1;
            this._startShape.draggable = this._endShape.draggable = true;
            this._startShape.ondrift = this._endShape.ondrift = this._ondrift;
            this._startShape.ondragend = this._endShape.ondragend = this._ondragend;
            this._startShape.style.textColor = this._endShape.style.textColor = this.dataRangeOption.textStyle.color;
            this._startShape.style.textAlign = this._endShape.style.textAlign = 'center';
            this._startShape.style.textPosition = this._endShape.style.textPosition = 'specific';
            this._startShape.style.textBaseline = this._endShape.style.textBaseline = 'middle';
            this._startShape.style.width = this._endShape.style.width = 0;
            this._startShape.style.height = this._endShape.style.height = 0;
            this._startShape.style.textPosition = this._endShape.style.textPosition = 'specific';
            this._startShape = new HandlePolygonShape(this._startShape);
            this._endShape = new HandlePolygonShape(this._endShape);
            this.shapeList.push(this._startShape);
            this.shapeList.push(this._endShape);
        },
        _bulidMask: function () {
            var x = this._calculableLocation.x;
            var y = this._calculableLocation.y;
            var width = this._calculableLocation.width;
            var height = this._calculableLocation.height;
            this._startMask = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase() + 1,
                style: {
                    x: x,
                    y: y,
                    width: this.dataRangeOption.orient == 'horizontal' ? 0 : width,
                    height: this.dataRangeOption.orient == 'horizontal' ? height : 0,
                    color: '#ccc'
                },
                hoverable: false
            };
            this._endMask = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase() + 1,
                style: {
                    x: this.dataRangeOption.orient == 'horizontal' ? x + width : x,
                    y: this.dataRangeOption.orient == 'horizontal' ? y : y + height,
                    width: this.dataRangeOption.orient == 'horizontal' ? 0 : width,
                    height: this.dataRangeOption.orient == 'horizontal' ? height : 0,
                    color: '#ccc'
                },
                hoverable: false
            };
            this._startMask = new RectangleShape(this._startMask);
            this._endMask = new RectangleShape(this._endMask);
            this.shapeList.push(this._startMask);
            this.shapeList.push(this._endMask);
        },
        _buildBackground: function () {
            var padding = this.reformCssArray(this.dataRangeOption.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: this.dataRangeOption.borderWidth === 0 ? 'fill' : 'both',
                    color: this.dataRangeOption.backgroundColor,
                    strokeColor: this.dataRangeOption.borderColor,
                    lineWidth: this.dataRangeOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var data = this._valueTextList;
            var dataLength = data.length;
            var itemGap = this.dataRangeOption.itemGap;
            var itemWidth = this.dataRangeOption.itemWidth;
            var itemHeight = this.dataRangeOption.itemHeight;
            var totalWidth = 0;
            var totalHeight = 0;
            var font = this.getFont(this.dataRangeOption.textStyle);
            var textHeight = zrArea.getTextHeight('国', font);
            var mSize = 6;
            if (this.dataRangeOption.orient == 'horizontal') {
                if (this.dataRangeOption.text || this.dataRangeOption.splitNumber <= 0 || this.dataRangeOption.calculable) {
                    totalWidth = (this.dataRangeOption.splitNumber <= 0 || this.dataRangeOption.calculable ? itemWidth * mSize + itemGap : dataLength * (itemWidth + itemGap)) + (this.dataRangeOption.text && typeof this.dataRangeOption.text[0] != 'undefined' ? zrArea.getTextWidth(this.dataRangeOption.text[0], font) + this._textGap : 0) + (this.dataRangeOption.text && typeof this.dataRangeOption.text[1] != 'undefined' ? zrArea.getTextWidth(this.dataRangeOption.text[1], font) + this._textGap : 0);
                } else {
                    itemWidth += 5;
                    for (var i = 0; i < dataLength; i++) {
                        totalWidth += itemWidth + zrArea.getTextWidth(data[i], font) + itemGap;
                    }
                }
                totalWidth -= itemGap;
                totalHeight = Math.max(textHeight, itemHeight);
            } else {
                var maxWidth;
                if (this.dataRangeOption.text || this.dataRangeOption.splitNumber <= 0 || this.dataRangeOption.calculable) {
                    totalHeight = (this.dataRangeOption.splitNumber <= 0 || this.dataRangeOption.calculable ? itemHeight * mSize + itemGap : dataLength * (itemHeight + itemGap)) + (this.dataRangeOption.text && typeof this.dataRangeOption.text[0] != 'undefined' ? this._textGap + textHeight : 0) + (this.dataRangeOption.text && typeof this.dataRangeOption.text[1] != 'undefined' ? this._textGap + textHeight : 0);
                    maxWidth = Math.max(zrArea.getTextWidth(this.dataRangeOption.text && this.dataRangeOption.text[0] || '', font), zrArea.getTextWidth(this.dataRangeOption.text && this.dataRangeOption.text[1] || '', font));
                    totalWidth = Math.max(itemWidth, maxWidth);
                } else {
                    totalHeight = (itemHeight + itemGap) * dataLength;
                    itemWidth += 5;
                    maxWidth = 0;
                    for (var i = 0; i < dataLength; i++) {
                        maxWidth = Math.max(maxWidth, zrArea.getTextWidth(data[i], font));
                    }
                    totalWidth = itemWidth + maxWidth;
                }
                totalHeight -= itemGap;
            }
            var padding = this.reformCssArray(this.dataRangeOption.padding);
            var x;
            var zrWidth = this.zr.getWidth();
            switch (this.dataRangeOption.x) {
            case 'center':
                x = Math.floor((zrWidth - totalWidth) / 2);
                break;
            case 'left':
                x = padding[3] + this.dataRangeOption.borderWidth;
                break;
            case 'right':
                x = zrWidth - totalWidth - padding[1] - this.dataRangeOption.borderWidth;
                break;
            default:
                x = this.parsePercent(this.dataRangeOption.x, zrWidth);
                x = isNaN(x) ? 0 : x;
                break;
            }
            var y;
            var zrHeight = this.zr.getHeight();
            switch (this.dataRangeOption.y) {
            case 'top':
                y = padding[0] + this.dataRangeOption.borderWidth;
                break;
            case 'bottom':
                y = zrHeight - totalHeight - padding[2] - this.dataRangeOption.borderWidth;
                break;
            case 'center':
                y = Math.floor((zrHeight - totalHeight) / 2);
                break;
            default:
                y = this.parsePercent(this.dataRangeOption.y, zrHeight);
                y = isNaN(y) ? 0 : y;
                break;
            }
            if (this.dataRangeOption.calculable) {
                var handlerWidth = Math.max(zrArea.getTextWidth(this.dataRangeOption.max, font), zrArea.getTextWidth(this.dataRangeOption.min, font)) + textHeight;
                if (this.dataRangeOption.orient == 'horizontal') {
                    if (x < handlerWidth) {
                        x = handlerWidth;
                    }
                    if (x + totalWidth + handlerWidth > zrWidth) {
                        x -= handlerWidth;
                    }
                } else {
                    if (y < textHeight) {
                        y = textHeight;
                    }
                    if (y + totalHeight + textHeight > zrHeight) {
                        y -= textHeight;
                    }
                }
            }
            return {
                x: x,
                y: y,
                width: totalWidth,
                height: totalHeight
            };
        },
        _getTextShape: function (x, y, text) {
            return {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: this.dataRangeOption.orient == 'horizontal' ? x : this._itemGroupLocation.x + this._itemGroupLocation.width / 2,
                    y: this.dataRangeOption.orient == 'horizontal' ? this._itemGroupLocation.y + this._itemGroupLocation.height / 2 : y,
                    color: this.dataRangeOption.textStyle.color,
                    text: text,
                    textFont: this.getFont(this.dataRangeOption.textStyle),
                    textBaseline: this.dataRangeOption.orient == 'horizontal' ? 'middle' : 'top',
                    textAlign: this.dataRangeOption.orient == 'horizontal' ? 'left' : 'center'
                },
                hoverable: false
            };
        },
        _getItemShape: function (x, y, width, height, color) {
            return {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: x,
                    y: y + 1,
                    width: width,
                    height: height - 2,
                    color: color
                },
                highlightStyle: {
                    strokeColor: color,
                    lineWidth: 1
                }
            };
        },
        __ondrift: function (shape, dx, dy) {
            var x = this._calculableLocation.x;
            var y = this._calculableLocation.y;
            var width = this._calculableLocation.width;
            var height = this._calculableLocation.height;
            if (this.dataRangeOption.orient == 'horizontal') {
                if (shape.style.x + dx <= x) {
                    shape.style.x = x;
                } else if (shape.style.x + dx + shape.style.width >= x + width) {
                    shape.style.x = x + width - shape.style.width;
                } else {
                    shape.style.x += dx;
                }
            } else {
                if (shape.style.y + dy <= y) {
                    shape.style.y = y;
                } else if (shape.style.y + dy + shape.style.height >= y + height) {
                    shape.style.y = y + height - shape.style.height;
                } else {
                    shape.style.y += dy;
                }
            }
            if (shape._type == 'filler') {
                this._syncHandleShape();
            } else {
                this._syncFillerShape(shape);
            }
            if (this.dataRangeOption.realtime) {
                this._dispatchDataRange();
            }
            return true;
        },
        __ondragend: function () {
            this.isDragend = true;
        },
        ondragend: function (param, status) {
            if (!this.isDragend || !param.target) {
                return;
            }
            status.dragOut = true;
            status.dragIn = true;
            if (!this.dataRangeOption.realtime) {
                this._dispatchDataRange();
            }
            status.needRefresh = false;
            this.isDragend = false;
            return;
        },
        _syncShapeFromRange: function () {
            var range = this.dataRangeOption.range || {};
            this._range.end = typeof this._range.end != 'undefined' ? this._range.end : typeof range.start != 'undefined' ? range.start : 0;
            this._range.start = typeof this._range.start != 'undefined' ? this._range.start : typeof range.end != 'undefined' ? range.end : 100;
            if (this._range.start != 100 || this._range.end !== 0) {
                if (this.dataRangeOption.orient == 'horizontal') {
                    var width = this._fillerShape.style.width;
                    this._fillerShape.style.x += width * (100 - this._range.start) / 100;
                    this._fillerShape.style.width = width * (this._range.start - this._range.end) / 100;
                } else {
                    var height = this._fillerShape.style.height;
                    this._fillerShape.style.y += height * (100 - this._range.start) / 100;
                    this._fillerShape.style.height = height * (this._range.start - this._range.end) / 100;
                }
                this.zr.modShape(this._fillerShape.id);
                this._syncHandleShape();
            }
        },
        _syncHandleShape: function () {
            var x = this._calculableLocation.x;
            var y = this._calculableLocation.y;
            var width = this._calculableLocation.width;
            var height = this._calculableLocation.height;
            if (this.dataRangeOption.orient == 'horizontal') {
                this._startShape.style.x = this._fillerShape.style.x;
                this._startMask.style.width = this._startShape.style.x - x;
                this._endShape.style.x = this._fillerShape.style.x + this._fillerShape.style.width;
                this._endMask.style.x = this._endShape.style.x;
                this._endMask.style.width = x + width - this._endShape.style.x;
                this._range.start = Math.ceil(100 - (this._startShape.style.x - x) / width * 100);
                this._range.end = Math.floor(100 - (this._endShape.style.x - x) / width * 100);
            } else {
                this._startShape.style.y = this._fillerShape.style.y;
                this._startMask.style.height = this._startShape.style.y - y;
                this._endShape.style.y = this._fillerShape.style.y + this._fillerShape.style.height;
                this._endMask.style.y = this._endShape.style.y;
                this._endMask.style.height = y + height - this._endShape.style.y;
                this._range.start = Math.ceil(100 - (this._startShape.style.y - y) / height * 100);
                this._range.end = Math.floor(100 - (this._endShape.style.y - y) / height * 100);
            }
            this._syncShape();
        },
        _syncFillerShape: function (e) {
            var x = this._calculableLocation.x;
            var y = this._calculableLocation.y;
            var width = this._calculableLocation.width;
            var height = this._calculableLocation.height;
            var a;
            var b;
            if (this.dataRangeOption.orient == 'horizontal') {
                a = this._startShape.style.x;
                b = this._endShape.style.x;
                if (e.id == this._startShape.id && a >= b) {
                    b = a;
                    this._endShape.style.x = a;
                } else if (e.id == this._endShape.id && a >= b) {
                    a = b;
                    this._startShape.style.x = a;
                }
                this._fillerShape.style.x = a;
                this._fillerShape.style.width = b - a;
                this._startMask.style.width = a - x;
                this._endMask.style.x = b;
                this._endMask.style.width = x + width - b;
                this._range.start = Math.ceil(100 - (a - x) / width * 100);
                this._range.end = Math.floor(100 - (b - x) / width * 100);
            } else {
                a = this._startShape.style.y;
                b = this._endShape.style.y;
                if (e.id == this._startShape.id && a >= b) {
                    b = a;
                    this._endShape.style.y = a;
                } else if (e.id == this._endShape.id && a >= b) {
                    a = b;
                    this._startShape.style.y = a;
                }
                this._fillerShape.style.y = a;
                this._fillerShape.style.height = b - a;
                this._startMask.style.height = a - y;
                this._endMask.style.y = b;
                this._endMask.style.height = y + height - b;
                this._range.start = Math.ceil(100 - (a - y) / height * 100);
                this._range.end = Math.floor(100 - (b - y) / height * 100);
            }
            this._syncShape();
        },
        _syncShape: function () {
            this._startShape.position = [
                this._startShape.style.x - this._startShape.style._x,
                this._startShape.style.y - this._startShape.style._y
            ];
            this._startShape.style.text = this._textFormat(this._gap * this._range.start + this.dataRangeOption.min);
            this._startShape.style.color = this._startShape.highlightStyle.strokeColor = this.getColor(this._gap * this._range.start + this.dataRangeOption.min);
            this._endShape.position = [
                this._endShape.style.x - this._endShape.style._x,
                this._endShape.style.y - this._endShape.style._y
            ];
            this._endShape.style.text = this._textFormat(this._gap * this._range.end + this.dataRangeOption.min);
            this._endShape.style.color = this._endShape.highlightStyle.strokeColor = this.getColor(this._gap * this._range.end + this.dataRangeOption.min);
            this.zr.modShape(this._startShape.id);
            this.zr.modShape(this._endShape.id);
            this.zr.modShape(this._startMask.id);
            this.zr.modShape(this._endMask.id);
            this.zr.modShape(this._fillerShape.id);
            this.zr.refreshNextFrame();
        },
        _dispatchDataRange: function () {
            this.messageCenter.dispatch(ecConfig.EVENT.DATA_RANGE, null, {
                range: {
                    start: this._range.end,
                    end: this._range.start
                }
            }, this.myChart);
        },
        __dataRangeSelected: function (param) {
            if (this.dataRangeOption.selectedMode === 'single') {
                for (var k in this._selectedMap) {
                    this._selectedMap[k] = false;
                }
            }
            var idx = param.target._idx;
            this._selectedMap[idx] = !this._selectedMap[idx];
            var valueMax = (this._colorList.length - idx) * this._gap + this.dataRangeOption.min;
            this.messageCenter.dispatch(ecConfig.EVENT.DATA_RANGE_SELECTED, param.event, {
                selected: this._selectedMap,
                target: idx,
                valueMax: valueMax,
                valueMin: valueMax - this._gap
            }, this.myChart);
            this.messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this.myChart);
        },
        __dispatchHoverLink: function (param) {
            var valueMin;
            var valueMax;
            if (this.dataRangeOption.calculable) {
                var totalValue = this.dataRangeOption.max - this.dataRangeOption.min;
                var curValue;
                if (this.dataRangeOption.orient == 'horizontal') {
                    curValue = (1 - (zrEvent.getX(param.event) - this._calculableLocation.x) / this._calculableLocation.width) * totalValue;
                } else {
                    curValue = (1 - (zrEvent.getY(param.event) - this._calculableLocation.y) / this._calculableLocation.height) * totalValue;
                }
                valueMin = curValue - totalValue * 0.05;
                valueMax = curValue + totalValue * 0.05;
            } else {
                var idx = param.target._idx;
                valueMax = (this._colorList.length - idx) * this._gap + this.dataRangeOption.min;
                valueMin = valueMax - this._gap;
            }
            this.messageCenter.dispatch(ecConfig.EVENT.DATA_RANGE_HOVERLINK, param.event, {
                valueMin: valueMin,
                valueMax: valueMax
            }, this.myChart);
            return;
        },
        __onhoverlink: function (param) {
            if (this.dataRangeOption.show && this.dataRangeOption.hoverLink && this._indicatorShape && param && param.seriesIndex != null && param.dataIndex != null) {
                var curValue = param.value;
                if (curValue === '' || isNaN(curValue)) {
                    return;
                }
                if (curValue < this.dataRangeOption.min) {
                    curValue = this.dataRangeOption.min;
                } else if (curValue > this.dataRangeOption.max) {
                    curValue = this.dataRangeOption.max;
                }
                if (this.dataRangeOption.orient == 'horizontal') {
                    this._indicatorShape.position = [
                        (this.dataRangeOption.max - curValue) / (this.dataRangeOption.max - this.dataRangeOption.min) * this._calculableLocation.width,
                        0
                    ];
                } else {
                    this._indicatorShape.position = [
                        0,
                        (this.dataRangeOption.max - curValue) / (this.dataRangeOption.max - this.dataRangeOption.min) * this._calculableLocation.height
                    ];
                }
                this._indicatorShape.style.text = this._textFormat(param.value);
                this._indicatorShape.style.color = this.getColor(curValue);
                this.zr.addHoverShape(this._indicatorShape);
            }
        },
        _textFormat: function (valueStart, valueEnd) {
            valueStart = valueStart.toFixed(this.dataRangeOption.precision);
            valueEnd = valueEnd != null ? valueEnd.toFixed(this.dataRangeOption.precision) : '';
            if (this.dataRangeOption.formatter) {
                if (typeof this.dataRangeOption.formatter == 'string') {
                    return this.dataRangeOption.formatter.replace('{value}', valueStart).replace('{value2}', valueEnd);
                } else if (typeof this.dataRangeOption.formatter == 'function') {
                    return this.dataRangeOption.formatter.call(this.myChart, valueStart, valueEnd);
                }
            }
            if (valueEnd !== '') {
                return valueStart + ' - ' + valueEnd;
            }
            return valueStart;
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.option.dataRange = this.reformOption(this.option.dataRange);
                this.dataRangeOption = this.option.dataRange;
                var splitNumber = this.dataRangeOption.splitNumber <= 0 || this.dataRangeOption.calculable ? 100 : this.dataRangeOption.splitNumber;
                this._colorList = zrColor.getGradientColors(this.dataRangeOption.color, Math.max((splitNumber - this.dataRangeOption.color.length) / (this.dataRangeOption.color.length - 1), 0) + 1);
                if (this._colorList.length > splitNumber) {
                    var len = this._colorList.length;
                    var newColorList = [this._colorList[0]];
                    var step = len / (splitNumber - 1);
                    for (var i = 1; i < splitNumber - 1; i++) {
                        newColorList.push(this._colorList[Math.floor(i * step)]);
                    }
                    newColorList.push(this._colorList[len - 1]);
                    this._colorList = newColorList;
                }
                var precision = this.dataRangeOption.precision;
                this._gap = (this.dataRangeOption.max - this.dataRangeOption.min) / splitNumber;
                while (this._gap.toFixed(precision) - 0 != this._gap && precision < 5) {
                    precision++;
                }
                this.dataRangeOption.precision = precision;
                this._gap = ((this.dataRangeOption.max - this.dataRangeOption.min) / splitNumber).toFixed(precision) - 0;
                this._valueTextList = [];
                for (var i = 0; i < splitNumber; i++) {
                    this._selectedMap[i] = true;
                    this._valueTextList.unshift(this._textFormat(i * this._gap + this.dataRangeOption.min, (i + 1) * this._gap + this.dataRangeOption.min));
                }
            }
            this.clear();
            this._buildShape();
        },
        getColor: function (value) {
            if (isNaN(value)) {
                return null;
            }
            if (this.dataRangeOption.min == this.dataRangeOption.max) {
                return this._colorList[0];
            }
            if (value < this.dataRangeOption.min) {
                value = this.dataRangeOption.min;
            } else if (value > this.dataRangeOption.max) {
                value = this.dataRangeOption.max;
            }
            if (this.dataRangeOption.calculable) {
                if (value - (this._gap * this._range.start + this.dataRangeOption.min) > 0.00005 || value - (this._gap * this._range.end + this.dataRangeOption.min) < -0.00005) {
                    return null;
                }
            }
            var idx = this._colorList.length - Math.ceil((value - this.dataRangeOption.min) / (this.dataRangeOption.max - this.dataRangeOption.min) * this._colorList.length);
            if (idx == this._colorList.length) {
                idx--;
            }
            if (this._selectedMap[idx]) {
                return this._colorList[idx];
            } else {
                return null;
            }
        },
        getColorByIndex: function (idx) {
            if (idx >= this._colorList.length) {
                idx = this._colorList.length - 1;
            } else if (idx < 0) {
                idx = 0;
            }
            return this._colorList[idx];
        },
        onbeforDispose: function () {
            this.messageCenter.unbind(ecConfig.EVENT.HOVER, this._onhoverlink);
        }
    };
    zrUtil.inherits(DataRange, Base);
    require('../component').define('dataRange', DataRange);
    return DataRange;
});define('echarts/component/roamController', [
    'require',
    './base',
    'zrender/shape/Rectangle',
    'zrender/shape/Sector',
    'zrender/shape/Circle',
    '../config',
    'zrender/tool/util',
    'zrender/tool/color',
    'zrender/tool/event',
    '../component'
], function (require) {
    var Base = require('./base');
    var RectangleShape = require('zrender/shape/Rectangle');
    var SectorShape = require('zrender/shape/Sector');
    var CircleShape = require('zrender/shape/Circle');
    var ecConfig = require('../config');
    ecConfig.roamController = {
        zlevel: 0,
        z: 4,
        show: true,
        x: 'left',
        y: 'top',
        width: 80,
        height: 120,
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 1,
        handleColor: '#6495ed',
        fillerColor: '#fff',
        step: 15,
        mapTypeControl: null
    };
    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');
    var zrEvent = require('zrender/tool/event');
    function RoamController(ecTheme, messageCenter, zr, option, myChart) {
        if (!option.roamController || !option.roamController.show) {
            return;
        }
        if (!option.roamController.mapTypeControl) {
            console.error('option.roamController.mapTypeControl has not been defined.');
            return;
        }
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.rcOption = option.roamController;
        var self = this;
        this._drictionMouseDown = function (params) {
            return self.__drictionMouseDown(params);
        };
        this._drictionMouseUp = function (params) {
            return self.__drictionMouseUp(params);
        };
        this._drictionMouseMove = function (params) {
            return self.__drictionMouseMove(params);
        };
        this._drictionMouseOut = function (params) {
            return self.__drictionMouseOut(params);
        };
        this._scaleHandler = function (params) {
            return self.__scaleHandler(params);
        };
        this.refresh(option);
    }
    RoamController.prototype = {
        type: ecConfig.COMPONENT_TYPE_ROAMCONTROLLER,
        _buildShape: function () {
            if (!this.rcOption.show) {
                return;
            }
            this._itemGroupLocation = this._getItemGroupLocation();
            this._buildBackground();
            this._buildItem();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildItem: function () {
            this.shapeList.push(this._getDirectionShape('up'));
            this.shapeList.push(this._getDirectionShape('down'));
            this.shapeList.push(this._getDirectionShape('left'));
            this.shapeList.push(this._getDirectionShape('right'));
            this.shapeList.push(this._getScaleShape('scaleUp'));
            this.shapeList.push(this._getScaleShape('scaleDown'));
        },
        _getDirectionShape: function (direction) {
            var r = this._itemGroupLocation.r;
            var x = this._itemGroupLocation.x + r;
            var y = this._itemGroupLocation.y + r;
            var sectorShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: x,
                    y: y,
                    r: r,
                    startAngle: -45,
                    endAngle: 45,
                    color: this.rcOption.handleColor,
                    text: '>',
                    textX: x + r / 2 + 4,
                    textY: y - 0.5,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    textPosition: 'specific',
                    textColor: this.rcOption.fillerColor,
                    textFont: Math.floor(r / 2) + 'px arial'
                },
                highlightStyle: {
                    color: zrColor.lift(this.rcOption.handleColor, -0.2),
                    brushType: 'fill'
                },
                clickable: true
            };
            switch (direction) {
            case 'up':
                sectorShape.rotation = [
                    Math.PI / 2,
                    x,
                    y
                ];
                break;
            case 'left':
                sectorShape.rotation = [
                    Math.PI,
                    x,
                    y
                ];
                break;
            case 'down':
                sectorShape.rotation = [
                    -Math.PI / 2,
                    x,
                    y
                ];
                break;
            }
            sectorShape = new SectorShape(sectorShape);
            sectorShape._roamType = direction;
            sectorShape.onmousedown = this._drictionMouseDown;
            sectorShape.onmouseup = this._drictionMouseUp;
            sectorShape.onmousemove = this._drictionMouseMove;
            sectorShape.onmouseout = this._drictionMouseOut;
            return sectorShape;
        },
        _getScaleShape: function (text) {
            var width = this._itemGroupLocation.width;
            var height = this._itemGroupLocation.height - width;
            height = height < 0 ? 20 : height;
            var r = Math.min(width / 2 - 5, height) / 2;
            var x = this._itemGroupLocation.x + (text === 'scaleDown' ? width - r : r);
            var y = this._itemGroupLocation.y + this._itemGroupLocation.height - r;
            var scaleShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: x,
                    y: y,
                    r: r,
                    color: this.rcOption.handleColor,
                    text: text === 'scaleDown' ? '-' : '+',
                    textX: x,
                    textY: y - 2,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    textPosition: 'specific',
                    textColor: this.rcOption.fillerColor,
                    textFont: Math.floor(r) + 'px verdana'
                },
                highlightStyle: {
                    color: zrColor.lift(this.rcOption.handleColor, -0.2),
                    brushType: 'fill'
                },
                clickable: true
            };
            scaleShape = new CircleShape(scaleShape);
            scaleShape._roamType = text;
            scaleShape.onmousedown = this._scaleHandler;
            return scaleShape;
        },
        _buildBackground: function () {
            var padding = this.reformCssArray(this.rcOption.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: this.rcOption.borderWidth === 0 ? 'fill' : 'both',
                    color: this.rcOption.backgroundColor,
                    strokeColor: this.rcOption.borderColor,
                    lineWidth: this.rcOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var padding = this.reformCssArray(this.rcOption.padding);
            var width = this.rcOption.width;
            var height = this.rcOption.height;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            var x;
            switch (this.rcOption.x) {
            case 'center':
                x = Math.floor((zrWidth - width) / 2);
                break;
            case 'left':
                x = padding[3] + this.rcOption.borderWidth;
                break;
            case 'right':
                x = zrWidth - width - padding[1] - padding[3] - this.rcOption.borderWidth * 2;
                break;
            default:
                x = this.parsePercent(this.rcOption.x, zrWidth);
                break;
            }
            var y;
            switch (this.rcOption.y) {
            case 'top':
                y = padding[0] + this.rcOption.borderWidth;
                break;
            case 'bottom':
                y = zrHeight - height - padding[0] - padding[2] - this.rcOption.borderWidth * 2;
                break;
            case 'center':
                y = Math.floor((zrHeight - height) / 2);
                break;
            default:
                y = this.parsePercent(this.rcOption.y, zrHeight);
                break;
            }
            return {
                x: x,
                y: y,
                r: width / 2,
                width: width,
                height: height
            };
        },
        __drictionMouseDown: function (params) {
            this.mousedown = true;
            this._drictionHandlerOn(params);
        },
        __drictionMouseUp: function (params) {
            this.mousedown = false;
            this._drictionHandlerOff(params);
        },
        __drictionMouseMove: function (params) {
            if (this.mousedown) {
                this._drictionHandlerOn(params);
            }
        },
        __drictionMouseOut: function (params) {
            this._drictionHandlerOff(params);
        },
        _drictionHandlerOn: function (params) {
            this._dispatchEvent(params.event, params.target._roamType);
            clearInterval(this.dircetionTimer);
            var self = this;
            this.dircetionTimer = setInterval(function () {
                self._dispatchEvent(params.event, params.target._roamType);
            }, 100);
            zrEvent.stop(params.event);
        },
        _drictionHandlerOff: function (params) {
            clearInterval(this.dircetionTimer);
        },
        __scaleHandler: function (params) {
            this._dispatchEvent(params.event, params.target._roamType);
            zrEvent.stop(params.event);
        },
        _dispatchEvent: function (event, roamType) {
            this.messageCenter.dispatch(ecConfig.EVENT.ROAMCONTROLLER, event, {
                roamType: roamType,
                mapTypeControl: this.rcOption.mapTypeControl,
                step: this.rcOption.step
            }, this.myChart);
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption || this.option;
                this.option.roamController = this.reformOption(this.option.roamController);
                this.rcOption = this.option.roamController;
            }
            this.clear();
            this._buildShape();
        }
    };
    zrUtil.inherits(RoamController, Base);
    require('../component').define('roamController', RoamController);
    return RoamController;
});define('echarts/util/mapData/params', ['require'], function (require) {
    function decode(json) {
        if (!json.UTF8Encoding) {
            return json;
        }
        var features = json.features;
        for (var f = 0; f < features.length; f++) {
            var feature = features[f];
            var coordinates = feature.geometry.coordinates;
            var encodeOffsets = feature.geometry.encodeOffsets;
            for (var c = 0; c < coordinates.length; c++) {
                var coordinate = coordinates[c];
                if (feature.geometry.type === 'Polygon') {
                    coordinates[c] = decodePolygon(coordinate, encodeOffsets[c]);
                } else if (feature.geometry.type === 'MultiPolygon') {
                    for (var c2 = 0; c2 < coordinate.length; c2++) {
                        var polygon = coordinate[c2];
                        coordinate[c2] = decodePolygon(polygon, encodeOffsets[c][c2]);
                    }
                }
            }
        }
        json.UTF8Encoding = false;
        return json;
    }
    function decodePolygon(coordinate, encodeOffsets) {
        var result = [];
        var prevX = encodeOffsets[0];
        var prevY = encodeOffsets[1];
        for (var i = 0; i < coordinate.length; i += 2) {
            var x = coordinate.charCodeAt(i) - 64;
            var y = coordinate.charCodeAt(i + 1) - 64;
            x = x >> 1 ^ -(x & 1);
            y = y >> 1 ^ -(y & 1);
            x += prevX;
            y += prevY;
            prevX = x;
            prevY = y;
            result.push([
                x / 1024,
                y / 1024
            ]);
        }
        return result;
    }
    var mapParams = {
        'none': {
            getGeoJson: function (callback) {
                callback({
                    type: 'FeatureCollection',
                    features: [{
                            type: 'Feature',
                            geometry: {
                                coordinates: [],
                                encodeOffsets: [],
                                type: 'Polygon'
                            },
                            properties: {}
                        }]
                });
            }
        },
        'world': {
            getGeoJson: function (callback) {
                require(['./geoJson/world_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        'china': {
            getGeoJson: function (callback) {
                require(['./geoJson/china_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '南海诸岛': {
            textCoord: [
                126,
                25
            ],
            getPath: function (leftTop, scale) {
                var pList = [
                    [
                        [
                            0,
                            3.5
                        ],
                        [
                            7,
                            11.2
                        ],
                        [
                            15,
                            11.9
                        ],
                        [
                            30,
                            7
                        ],
                        [
                            42,
                            0.7
                        ],
                        [
                            52,
                            0.7
                        ],
                        [
                            56,
                            7.7
                        ],
                        [
                            59,
                            0.7
                        ],
                        [
                            64,
                            0.7
                        ],
                        [
                            64,
                            0
                        ],
                        [
                            5,
                            0
                        ],
                        [
                            0,
                            3.5
                        ]
                    ],
                    [
                        [
                            13,
                            16.1
                        ],
                        [
                            19,
                            14.7
                        ],
                        [
                            16,
                            21.7
                        ],
                        [
                            11,
                            23.1
                        ],
                        [
                            13,
                            16.1
                        ]
                    ],
                    [
                        [
                            12,
                            32.2
                        ],
                        [
                            14,
                            38.5
                        ],
                        [
                            15,
                            38.5
                        ],
                        [
                            13,
                            32.2
                        ],
                        [
                            12,
                            32.2
                        ]
                    ],
                    [
                        [
                            16,
                            47.6
                        ],
                        [
                            12,
                            53.2
                        ],
                        [
                            13,
                            53.2
                        ],
                        [
                            18,
                            47.6
                        ],
                        [
                            16,
                            47.6
                        ]
                    ],
                    [
                        [
                            6,
                            64.4
                        ],
                        [
                            8,
                            70
                        ],
                        [
                            9,
                            70
                        ],
                        [
                            8,
                            64.4
                        ],
                        [
                            6,
                            64.4
                        ]
                    ],
                    [
                        [
                            23,
                            82.6
                        ],
                        [
                            29,
                            79.8
                        ],
                        [
                            30,
                            79.8
                        ],
                        [
                            25,
                            82.6
                        ],
                        [
                            23,
                            82.6
                        ]
                    ],
                    [
                        [
                            37,
                            70.7
                        ],
                        [
                            43,
                            62.3
                        ],
                        [
                            44,
                            62.3
                        ],
                        [
                            39,
                            70.7
                        ],
                        [
                            37,
                            70.7
                        ]
                    ],
                    [
                        [
                            48,
                            51.1
                        ],
                        [
                            51,
                            45.5
                        ],
                        [
                            53,
                            45.5
                        ],
                        [
                            50,
                            51.1
                        ],
                        [
                            48,
                            51.1
                        ]
                    ],
                    [
                        [
                            51,
                            35
                        ],
                        [
                            51,
                            28.7
                        ],
                        [
                            53,
                            28.7
                        ],
                        [
                            53,
                            35
                        ],
                        [
                            51,
                            35
                        ]
                    ],
                    [
                        [
                            52,
                            22.4
                        ],
                        [
                            55,
                            17.5
                        ],
                        [
                            56,
                            17.5
                        ],
                        [
                            53,
                            22.4
                        ],
                        [
                            52,
                            22.4
                        ]
                    ],
                    [
                        [
                            58,
                            12.6
                        ],
                        [
                            62,
                            7
                        ],
                        [
                            63,
                            7
                        ],
                        [
                            60,
                            12.6
                        ],
                        [
                            58,
                            12.6
                        ]
                    ],
                    [
                        [
                            0,
                            3.5
                        ],
                        [
                            0,
                            93.1
                        ],
                        [
                            64,
                            93.1
                        ],
                        [
                            64,
                            0
                        ],
                        [
                            63,
                            0
                        ],
                        [
                            63,
                            92.4
                        ],
                        [
                            1,
                            92.4
                        ],
                        [
                            1,
                            3.5
                        ],
                        [
                            0,
                            3.5
                        ]
                    ]
                ];
                var str = '';
                var left = leftTop[0];
                var top = leftTop[1];
                for (var i = 0, l = pList.length; i < l; i++) {
                    str += 'M ' + ((pList[i][0][0] * scale + left).toFixed(2) - 0) + ' ' + ((pList[i][0][1] * scale + top).toFixed(2) - 0) + ' ';
                    for (var j = 1, k = pList[i].length; j < k; j++) {
                        str += 'L ' + ((pList[i][j][0] * scale + left).toFixed(2) - 0) + ' ' + ((pList[i][j][1] * scale + top).toFixed(2) - 0) + ' ';
                    }
                }
                return str + ' Z';
            }
        },
        '新疆': {
            getGeoJson: function (callback) {
                require(['./geoJson/xin_jiang_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '西藏': {
            getGeoJson: function (callback) {
                require(['./geoJson/xi_zang_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '内蒙古': {
            getGeoJson: function (callback) {
                require(['./geoJson/nei_meng_gu_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '青海': {
            getGeoJson: function (callback) {
                require(['./geoJson/qing_hai_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '四川': {
            getGeoJson: function (callback) {
                require(['./geoJson/si_chuan_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '黑龙江': {
            getGeoJson: function (callback) {
                require(['./geoJson/hei_long_jiang_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '甘肃': {
            getGeoJson: function (callback) {
                require(['./geoJson/gan_su_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '云南': {
            getGeoJson: function (callback) {
                require(['./geoJson/yun_nan_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '广西': {
            getGeoJson: function (callback) {
                require(['./geoJson/guang_xi_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '湖南': {
            getGeoJson: function (callback) {
                require(['./geoJson/hu_nan_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '陕西': {
            getGeoJson: function (callback) {
                require(['./geoJson/shan_xi_1_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '广东': {
            getGeoJson: function (callback) {
                require(['./geoJson/guang_dong_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '吉林': {
            getGeoJson: function (callback) {
                require(['./geoJson/ji_lin_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '河北': {
            getGeoJson: function (callback) {
                require(['./geoJson/he_bei_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '湖北': {
            getGeoJson: function (callback) {
                require(['./geoJson/hu_bei_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '贵州': {
            getGeoJson: function (callback) {
                require(['./geoJson/gui_zhou_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '山东': {
            getGeoJson: function (callback) {
                require(['./geoJson/shan_dong_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '江西': {
            getGeoJson: function (callback) {
                require(['./geoJson/jiang_xi_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '河南': {
            getGeoJson: function (callback) {
                require(['./geoJson/he_nan_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '辽宁': {
            getGeoJson: function (callback) {
                require(['./geoJson/liao_ning_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '山西': {
            getGeoJson: function (callback) {
                require(['./geoJson/shan_xi_2_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '安徽': {
            getGeoJson: function (callback) {
                require(['./geoJson/an_hui_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '福建': {
            getGeoJson: function (callback) {
                require(['./geoJson/fu_jian_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '浙江': {
            getGeoJson: function (callback) {
                require(['./geoJson/zhe_jiang_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '江苏': {
            getGeoJson: function (callback) {
                require(['./geoJson/jiang_su_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '重庆': {
            getGeoJson: function (callback) {
                require(['./geoJson/chong_qing_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '宁夏': {
            getGeoJson: function (callback) {
                require(['./geoJson/ning_xia_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '海南': {
            getGeoJson: function (callback) {
                require(['./geoJson/hai_nan_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '台湾': {
            getGeoJson: function (callback) {
                require(['./geoJson/tai_wan_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '北京': {
            getGeoJson: function (callback) {
                require(['./geoJson/bei_jing_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '天津': {
            getGeoJson: function (callback) {
                require(['./geoJson/tian_jin_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '上海': {
            getGeoJson: function (callback) {
                require(['./geoJson/shang_hai_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '香港': {
            getGeoJson: function (callback) {
                require(['./geoJson/xiang_gang_geo'], function (md) {
                    callback(decode(md));
                });
            }
        },
        '澳门': {
            getGeoJson: function (callback) {
                require(['./geoJson/ao_men_geo'], function (md) {
                    callback(decode(md));
                });
            }
        }
    };
    return {
        decode: decode,
        params: mapParams
    };
});define('echarts/util/mapData/textFixed', [], function () {
    return {
        '广东': [
            0,
            -10
        ],
        '香港': [
            10,
            10
        ],
        '澳门': [
            -10,
            18
        ],
        '黑龙江': [
            0,
            20
        ],
        '天津': [
            5,
            5
        ],
        '深圳市': [
            -35,
            0
        ],
        '红河哈尼族彝族自治州': [
            0,
            20
        ],
        '楚雄彝族自治州': [
            -5,
            15
        ],
        '石河子市': [
            -5,
            5
        ],
        '五家渠市': [
            0,
            -10
        ],
        '昌吉回族自治州': [
            10,
            10
        ],
        '昌江黎族自治县': [
            0,
            20
        ],
        '陵水黎族自治县': [
            0,
            20
        ],
        '东方市': [
            0,
            20
        ],
        '渭南市': [
            0,
            20
        ]
    };
});define('echarts/util/mapData/geoCoord', [], function () {
    return {
        'Russia': [
            100,
            60
        ],
        'United States of America': [
            -99,
            38
        ]
    };
});define('echarts/util/projection/svg', [
    'require',
    'zrender/shape/Path'
], function (require) {
    var PathShape = require('zrender/shape/Path');
    function toFloat(str) {
        return parseFloat(str || 0);
    }
    function getBbox(root) {
        var svgNode = root.firstChild;
        while (!(svgNode.nodeName.toLowerCase() == 'svg' && svgNode.nodeType == 1)) {
            svgNode = svgNode.nextSibling;
        }
        var x = toFloat(svgNode.getAttribute('x'));
        var y = toFloat(svgNode.getAttribute('y'));
        var width = toFloat(svgNode.getAttribute('width'));
        var height = toFloat(svgNode.getAttribute('height'));
        return {
            left: x,
            top: y,
            width: width,
            height: height
        };
    }
    function geoJson2Path(root, transform) {
        var scale = [
            transform.scale.x,
            transform.scale.y
        ];
        var elList = [];
        function _getShape(root) {
            var tagName = root.tagName;
            if (shapeBuilders[tagName]) {
                var obj = shapeBuilders[tagName](root, scale);
                if (obj) {
                    obj.scale = scale;
                    obj.properties = { name: root.getAttribute('name') || '' };
                    obj.id = root.id;
                    extendCommonAttributes(obj, root);
                    elList.push(obj);
                }
            }
            var shapes = root.childNodes;
            for (var i = 0, len = shapes.length; i < len; i++) {
                _getShape(shapes[i]);
            }
        }
        _getShape(root);
        return elList;
    }
    function pos2geo(obj, p) {
        var point = p instanceof Array ? [
            p[0] * 1,
            p[1] * 1
        ] : [
            p.x * 1,
            p.y * 1
        ];
        return [
            point[0] / obj.scale.x,
            point[1] / obj.scale.y
        ];
    }
    function geo2pos(obj, p) {
        var point = p instanceof Array ? [
            p[0] * 1,
            p[1] * 1
        ] : [
            p.x * 1,
            p.y * 1
        ];
        return [
            point[0] * obj.scale.x,
            point[1] * obj.scale.y
        ];
    }
    function trim(str) {
        return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
    }
    function extendCommonAttributes(obj, xmlNode) {
        var color = xmlNode.getAttribute('fill');
        var strokeColor = xmlNode.getAttribute('stroke');
        var lineWidth = xmlNode.getAttribute('stroke-width');
        var opacity = xmlNode.getAttribute('opacity');
        if (color && color != 'none') {
            obj.color = color;
            if (strokeColor) {
                obj.brushType = 'both';
                obj.strokeColor = strokeColor;
            } else {
                obj.brushType = 'fill';
            }
        } else if (strokeColor && strokeColor != 'none') {
            obj.strokeColor = strokeColor;
            obj.brushType = 'stroke';
        }
        if (lineWidth && lineWidth != 'none') {
            obj.lineWidth = parseFloat(lineWidth);
        }
        if (opacity && opacity != 'none') {
            obj.opacity = parseFloat(opacity);
        }
    }
    function parsePoints(str) {
        var list = trim(str).replace(/,/g, ' ').split(/\s+/);
        var points = [];
        for (var i = 0; i < list.length;) {
            var x = parseFloat(list[i++]);
            var y = parseFloat(list[i++]);
            points.push([
                x,
                y
            ]);
        }
        return points;
    }
    var shapeBuilders = {
        path: function (xmlNode, scale) {
            var path = xmlNode.getAttribute('d');
            var rect = PathShape.prototype.getRect({ path: path });
            return {
                shapeType: 'path',
                path: path,
                cp: [
                    (rect.x + rect.width / 2) * scale[0],
                    (rect.y + rect.height / 2) * scale[1]
                ]
            };
        },
        rect: function (xmlNode, scale) {
            var x = toFloat(xmlNode.getAttribute('x'));
            var y = toFloat(xmlNode.getAttribute('y'));
            var width = toFloat(xmlNode.getAttribute('width'));
            var height = toFloat(xmlNode.getAttribute('height'));
            return {
                shapeType: 'rectangle',
                x: x,
                y: y,
                width: width,
                height: height,
                cp: [
                    (x + width / 2) * scale[0],
                    (y + height / 2) * scale[1]
                ]
            };
        },
        line: function (xmlNode, scale) {
            var x1 = toFloat(xmlNode.getAttribute('x1'));
            var y1 = toFloat(xmlNode.getAttribute('y1'));
            var x2 = toFloat(xmlNode.getAttribute('x2'));
            var y2 = toFloat(xmlNode.getAttribute('y2'));
            return {
                shapeType: 'line',
                xStart: x1,
                yStart: y1,
                xEnd: x2,
                yEnd: y2,
                cp: [
                    (x1 + x2) * 0.5 * scale[0],
                    (y1 + y2) * 0.5 * scale[1]
                ]
            };
        },
        circle: function (xmlNode, scale) {
            var cx = toFloat(xmlNode.getAttribute('cx'));
            var cy = toFloat(xmlNode.getAttribute('cy'));
            var r = toFloat(xmlNode.getAttribute('r'));
            return {
                shapeType: 'circle',
                x: cx,
                y: cy,
                r: r,
                cp: [
                    cx * scale[0],
                    cy * scale[1]
                ]
            };
        },
        ellipse: function (xmlNode, scale) {
            var cx = parseFloat(xmlNode.getAttribute('cx') || 0);
            var cy = parseFloat(xmlNode.getAttribute('cy') || 0);
            var rx = parseFloat(xmlNode.getAttribute('rx') || 0);
            var ry = parseFloat(xmlNode.getAttribute('ry') || 0);
            return {
                shapeType: 'ellipse',
                x: cx,
                y: cy,
                a: rx,
                b: ry,
                cp: [
                    cx * scale[0],
                    cy * scale[1]
                ]
            };
        },
        polygon: function (xmlNode, scale) {
            var points = xmlNode.getAttribute('points');
            var min = [
                Infinity,
                Infinity
            ];
            var max = [
                -Infinity,
                -Infinity
            ];
            if (points) {
                points = parsePoints(points);
                for (var i = 0; i < points.length; i++) {
                    var p = points[i];
                    min[0] = Math.min(p[0], min[0]);
                    min[1] = Math.min(p[1], min[1]);
                    max[0] = Math.max(p[0], max[0]);
                    max[1] = Math.max(p[1], max[1]);
                }
                return {
                    shapeType: 'polygon',
                    pointList: points,
                    cp: [
                        (min[0] + max[0]) / 2 * scale[0],
                        (min[1] + max[1]) / 2 * scale[0]
                    ]
                };
            }
        },
        polyline: function (xmlNode, scale) {
            var obj = shapeBuilders.polygon(xmlNode, scale);
            return obj;
        }
    };
    return {
        getBbox: getBbox,
        geoJson2Path: geoJson2Path,
        pos2geo: pos2geo,
        geo2pos: geo2pos
    };
});define('echarts/util/projection/normal', [], function () {
    function getBbox(json, specialArea) {
        specialArea = specialArea || {};
        if (!json.srcSize) {
            parseSrcSize(json, specialArea);
        }
        return json.srcSize;
    }
    function parseSrcSize(json, specialArea) {
        specialArea = specialArea || {};
        convertorParse.xmin = 360;
        convertorParse.xmax = -360;
        convertorParse.ymin = 180;
        convertorParse.ymax = -180;
        var shapes = json.features;
        var geometries;
        var shape;
        for (var i = 0, len = shapes.length; i < len; i++) {
            shape = shapes[i];
            if (shape.properties.name && specialArea[shape.properties.name]) {
                continue;
            }
            switch (shape.type) {
            case 'Feature':
                convertorParse[shape.geometry.type](shape.geometry.coordinates);
                break;
            case 'GeometryCollection':
                geometries = shape.geometries;
                for (var j = 0, len2 = geometries.length; j < len2; j++) {
                    convertorParse[geometries[j].type](geometries[j].coordinates);
                }
                break;
            }
        }
        json.srcSize = {
            left: convertorParse.xmin.toFixed(4) * 1,
            top: convertorParse.ymin.toFixed(4) * 1,
            width: (convertorParse.xmax - convertorParse.xmin).toFixed(4) * 1,
            height: (convertorParse.ymax - convertorParse.ymin).toFixed(4) * 1
        };
        return json;
    }
    var convertor = {
        formatPoint: function (p) {
            return [
                (p[0] < -168.5 && p[1] > 63.8 ? p[0] + 360 : p[0]) + 168.5,
                90 - p[1]
            ];
        },
        makePoint: function (p) {
            var self = this;
            var point = self.formatPoint(p);
            if (self._bbox.xmin > p[0]) {
                self._bbox.xmin = p[0];
            }
            if (self._bbox.xmax < p[0]) {
                self._bbox.xmax = p[0];
            }
            if (self._bbox.ymin > p[1]) {
                self._bbox.ymin = p[1];
            }
            if (self._bbox.ymax < p[1]) {
                self._bbox.ymax = p[1];
            }
            var x = (point[0] - convertor.offset.x) * convertor.scale.x + convertor.offset.left;
            var y = (point[1] - convertor.offset.y) * convertor.scale.y + convertor.offset.top;
            return [
                x,
                y
            ];
        },
        Point: function (coordinates) {
            coordinates = this.makePoint(coordinates);
            return coordinates.join(',');
        },
        LineString: function (coordinates) {
            var str = '';
            var point;
            for (var i = 0, len = coordinates.length; i < len; i++) {
                point = convertor.makePoint(coordinates[i]);
                if (i === 0) {
                    str = 'M' + point.join(',');
                } else {
                    str = str + 'L' + point.join(',');
                }
            }
            return str;
        },
        Polygon: function (coordinates) {
            var str = '';
            for (var i = 0, len = coordinates.length; i < len; i++) {
                str = str + convertor.LineString(coordinates[i]) + 'z';
            }
            return str;
        },
        MultiPoint: function (coordinates) {
            var arr = [];
            for (var i = 0, len = coordinates.length; i < len; i++) {
                arr.push(convertor.Point(coordinates[i]));
            }
            return arr;
        },
        MultiLineString: function (coordinates) {
            var str = '';
            for (var i = 0, len = coordinates.length; i < len; i++) {
                str += convertor.LineString(coordinates[i]);
            }
            return str;
        },
        MultiPolygon: function (coordinates) {
            var str = '';
            for (var i = 0, len = coordinates.length; i < len; i++) {
                str += convertor.Polygon(coordinates[i]);
            }
            return str;
        }
    };
    var convertorParse = {
        formatPoint: convertor.formatPoint,
        makePoint: function (p) {
            var self = this;
            var point = self.formatPoint(p);
            var x = point[0];
            var y = point[1];
            if (self.xmin > x) {
                self.xmin = x;
            }
            if (self.xmax < x) {
                self.xmax = x;
            }
            if (self.ymin > y) {
                self.ymin = y;
            }
            if (self.ymax < y) {
                self.ymax = y;
            }
        },
        Point: function (coordinates) {
            this.makePoint(coordinates);
        },
        LineString: function (coordinates) {
            for (var i = 0, len = coordinates.length; i < len; i++) {
                this.makePoint(coordinates[i]);
            }
        },
        Polygon: function (coordinates) {
            for (var i = 0, len = coordinates.length; i < len; i++) {
                this.LineString(coordinates[i]);
            }
        },
        MultiPoint: function (coordinates) {
            for (var i = 0, len = coordinates.length; i < len; i++) {
                this.Point(coordinates[i]);
            }
        },
        MultiLineString: function (coordinates) {
            for (var i = 0, len = coordinates.length; i < len; i++) {
                this.LineString(coordinates[i]);
            }
        },
        MultiPolygon: function (coordinates) {
            for (var i = 0, len = coordinates.length; i < len; i++) {
                this.Polygon(coordinates[i]);
            }
        }
    };
    function geoJson2Path(json, transform, specialArea) {
        specialArea = specialArea || {};
        convertor.scale = null;
        convertor.offset = null;
        if (!json.srcSize) {
            parseSrcSize(json, specialArea);
        }
        transform.offset = {
            x: json.srcSize.left,
            y: json.srcSize.top,
            left: transform.OffsetLeft || 0,
            top: transform.OffsetTop || 0
        };
        convertor.scale = transform.scale;
        convertor.offset = transform.offset;
        var shapes = json.features;
        var geometries;
        var pathArray = [];
        var val;
        var shape;
        for (var i = 0, len = shapes.length; i < len; i++) {
            shape = shapes[i];
            if (shape.properties.name && specialArea[shape.properties.name]) {
                continue;
            }
            if (shape.type == 'Feature') {
                pushApath(shape.geometry, shape);
            } else if (shape.type == 'GeometryCollection') {
                geometries = shape.geometries;
                for (var j = 0, len2 = geometries.length; j < len2; j++) {
                    val = geometries[j];
                    pushApath(val, val);
                }
            }
        }
        var shapeType;
        var shapeCoordinates;
        var str;
        function pushApath(gm, shape) {
            shapeType = gm.type;
            shapeCoordinates = gm.coordinates;
            convertor._bbox = {
                xmin: 360,
                xmax: -360,
                ymin: 180,
                ymax: -180
            };
            str = convertor[shapeType](shapeCoordinates);
            pathArray.push({
                path: str,
                cp: shape.properties.cp ? convertor.makePoint(shape.properties.cp) : convertor.makePoint([
                    (convertor._bbox.xmin + convertor._bbox.xmax) / 2,
                    (convertor._bbox.ymin + convertor._bbox.ymax) / 2
                ]),
                properties: shape.properties,
                id: shape.id
            });
        }
        return pathArray;
    }
    function pos2geo(obj, p) {
        var x;
        var y;
        if (p instanceof Array) {
            x = p[0] * 1;
            y = p[1] * 1;
        } else {
            x = p.x * 1;
            y = p.y * 1;
        }
        x = x / obj.scale.x + obj.offset.x - 168.5;
        x = x > 180 ? x - 360 : x;
        y = 90 - (y / obj.scale.y + obj.offset.y);
        return [
            x,
            y
        ];
    }
    function geo2pos(obj, p) {
        convertor.offset = obj.offset;
        convertor.scale = obj.scale;
        return p instanceof Array ? convertor.makePoint([
            p[0] * 1,
            p[1] * 1
        ]) : convertor.makePoint([
            p.x * 1,
            p.y * 1
        ]);
    }
    return {
        getBbox: getBbox,
        geoJson2Path: geoJson2Path,
        pos2geo: pos2geo,
        geo2pos: geo2pos
    };
});define('echarts/util/shape/HandlePolygon', [
    'require',
    'zrender/shape/Base',
    'zrender/shape/Polygon',
    'zrender/tool/util'
], function (require) {
    var Base = require('zrender/shape/Base');
    var PolygonShape = require('zrender/shape/Polygon');
    var zrUtil = require('zrender/tool/util');
    function HandlePolygon(options) {
        Base.call(this, options);
    }
    HandlePolygon.prototype = {
        type: 'handle-polygon',
        buildPath: function (ctx, style) {
            PolygonShape.prototype.buildPath(ctx, style);
        },
        isCover: function (x, y) {
            var originPos = this.getTansform(x, y);
            x = originPos[0];
            y = originPos[1];
            var rect = this.style.rect;
            if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
                return true;
            } else {
                return false;
            }
        }
    };
    zrUtil.inherits(HandlePolygon, Base);
    return HandlePolygon;
});