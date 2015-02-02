define('echarts/chart/radar', [
    'require',
    './base',
    'zrender/shape/Polygon',
    '../component/polar',
    '../config',
    '../util/ecData',
    'zrender/tool/util',
    'zrender/tool/color',
    '../util/accMath',
    '../chart'
], function (require) {
    var ChartBase = require('./base');
    var PolygonShape = require('zrender/shape/Polygon');
    require('../component/polar');
    var ecConfig = require('../config');
    ecConfig.radar = {
        zlevel: 0,
        z: 2,
        clickable: true,
        legendHoverLink: true,
        polarIndex: 0,
        itemStyle: {
            normal: {
                label: { show: false },
                lineStyle: {
                    width: 2,
                    type: 'solid'
                }
            },
            emphasis: { label: { show: false } }
        },
        symbolSize: 2
    };
    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');
    function Radar(ecTheme, messageCenter, zr, option, myChart) {
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.refresh(option);
    }
    Radar.prototype = {
        type: ecConfig.CHART_TYPE_RADAR,
        _buildShape: function () {
            this.selectedMap = {};
            this._symbol = this.option.symbolList;
            this._queryTarget;
            this._dropBoxList = [];
            this._radarDataCounter = 0;
            var series = this.series;
            var legend = this.component.legend;
            var serieName;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].type === ecConfig.CHART_TYPE_RADAR) {
                    this.serie = this.reformOption(series[i]);
                    this.legendHoverLink = series[i].legendHoverLink || this.legendHoverLink;
                    serieName = this.serie.name || '';
                    this.selectedMap[serieName] = legend ? legend.isSelected(serieName) : true;
                    if (this.selectedMap[serieName]) {
                        this._queryTarget = [
                            this.serie,
                            this.option
                        ];
                        if (this.deepQuery(this._queryTarget, 'calculable')) {
                            this._addDropBox(i);
                        }
                        this._buildSingleRadar(i);
                        this.buildMark(i);
                    }
                }
            }
            this.addShapeList();
        },
        _buildSingleRadar: function (index) {
            var legend = this.component.legend;
            var iconShape;
            var data = this.serie.data;
            var defaultColor;
            var name;
            var pointList;
            var calculable = this.deepQuery(this._queryTarget, 'calculable');
            for (var i = 0; i < data.length; i++) {
                name = data[i].name || '';
                this.selectedMap[name] = legend ? legend.isSelected(name) : true;
                if (!this.selectedMap[name]) {
                    continue;
                }
                if (legend) {
                    defaultColor = legend.getColor(name);
                    iconShape = legend.getItemShape(name);
                    if (iconShape) {
                        iconShape.style.brushType = this.deepQuery([
                            data[i],
                            this.serie
                        ], 'itemStyle.normal.areaStyle') ? 'both' : 'stroke';
                        legend.setItemShape(name, iconShape);
                    }
                } else {
                    defaultColor = this.zr.getColor(i);
                }
                pointList = this._getPointList(this.serie.polarIndex, data[i]);
                this._addSymbol(pointList, defaultColor, i, index, this.serie.polarIndex);
                this._addDataShape(pointList, defaultColor, data[i], index, i, calculable);
                this._radarDataCounter++;
            }
        },
        _getPointList: function (polarIndex, dataArr) {
            var pointList = [];
            var vector;
            var polar = this.component.polar;
            var value;
            for (var i = 0, l = dataArr.value.length; i < l; i++) {
                value = this.getDataFromOption(dataArr.value[i]);
                vector = value != '-' ? polar.getVector(polarIndex, i, value) : false;
                if (vector) {
                    pointList.push(vector);
                }
            }
            return pointList;
        },
        _addSymbol: function (pointList, defaultColor, dataIndex, seriesIndex, polarIndex) {
            var series = this.series;
            var itemShape;
            var polar = this.component.polar;
            for (var i = 0, l = pointList.length; i < l; i++) {
                itemShape = this.getSymbolShape(this.deepMerge([
                    series[seriesIndex].data[dataIndex],
                    series[seriesIndex]
                ]), seriesIndex, series[seriesIndex].data[dataIndex].value[i], i, polar.getIndicatorText(polarIndex, i), pointList[i][0], pointList[i][1], this._symbol[this._radarDataCounter % this._symbol.length], defaultColor, '#fff', 'vertical');
                itemShape.zlevel = this.getZlevelBase();
                itemShape.z = this.getZBase() + 1;
                ecData.set(itemShape, 'data', series[seriesIndex].data[dataIndex]);
                ecData.set(itemShape, 'value', series[seriesIndex].data[dataIndex].value);
                ecData.set(itemShape, 'dataIndex', dataIndex);
                ecData.set(itemShape, 'special', i);
                this.shapeList.push(itemShape);
            }
        },
        _addDataShape: function (pointList, defaultColor, data, seriesIndex, dataIndex, calculable) {
            var series = this.series;
            var queryTarget = [
                data,
                this.serie
            ];
            var nColor = this.getItemStyleColor(this.deepQuery(queryTarget, 'itemStyle.normal.color'), seriesIndex, dataIndex, data);
            var nLineWidth = this.deepQuery(queryTarget, 'itemStyle.normal.lineStyle.width');
            var nLineType = this.deepQuery(queryTarget, 'itemStyle.normal.lineStyle.type');
            var nAreaColor = this.deepQuery(queryTarget, 'itemStyle.normal.areaStyle.color');
            var nIsAreaFill = this.deepQuery(queryTarget, 'itemStyle.normal.areaStyle');
            var shape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    pointList: pointList,
                    brushType: nIsAreaFill ? 'both' : 'stroke',
                    color: nAreaColor || nColor || (typeof defaultColor === 'string' ? zrColor.alpha(defaultColor, 0.5) : defaultColor),
                    strokeColor: nColor || defaultColor,
                    lineWidth: nLineWidth,
                    lineType: nLineType
                },
                highlightStyle: {
                    brushType: this.deepQuery(queryTarget, 'itemStyle.emphasis.areaStyle') || nIsAreaFill ? 'both' : 'stroke',
                    color: this.deepQuery(queryTarget, 'itemStyle.emphasis.areaStyle.color') || nAreaColor || nColor || (typeof defaultColor === 'string' ? zrColor.alpha(defaultColor, 0.5) : defaultColor),
                    strokeColor: this.getItemStyleColor(this.deepQuery(queryTarget, 'itemStyle.emphasis.color'), seriesIndex, dataIndex, data) || nColor || defaultColor,
                    lineWidth: this.deepQuery(queryTarget, 'itemStyle.emphasis.lineStyle.width') || nLineWidth,
                    lineType: this.deepQuery(queryTarget, 'itemStyle.emphasis.lineStyle.type') || nLineType
                }
            };
            ecData.pack(shape, series[seriesIndex], seriesIndex, data, dataIndex, data.name, this.component.polar.getIndicator(series[seriesIndex].polarIndex));
            if (calculable) {
                shape.draggable = true;
                this.setCalculable(shape);
            }
            shape = new PolygonShape(shape);
            this.shapeList.push(shape);
        },
        _addDropBox: function (index) {
            var series = this.series;
            var polarIndex = this.deepQuery(this._queryTarget, 'polarIndex');
            if (!this._dropBoxList[polarIndex]) {
                var shape = this.component.polar.getDropBox(polarIndex);
                shape.zlevel = this.getZlevelBase();
                shape.z = this.getZBase();
                this.setCalculable(shape);
                ecData.pack(shape, series, index, undefined, -1);
                this.shapeList.push(shape);
                this._dropBoxList[polarIndex] = true;
            }
        },
        ondragend: function (param, status) {
            var series = this.series;
            if (!this.isDragend || !param.target) {
                return;
            }
            var target = param.target;
            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');
            this.component.legend && this.component.legend.del(series[seriesIndex].data[dataIndex].name);
            series[seriesIndex].data.splice(dataIndex, 1);
            status.dragOut = true;
            status.needRefresh = true;
            this.isDragend = false;
            return;
        },
        ondrop: function (param, status) {
            var series = this.series;
            if (!this.isDrop || !param.target) {
                return;
            }
            var target = param.target;
            var dragged = param.dragged;
            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');
            var data;
            var legend = this.component.legend;
            var value;
            if (dataIndex === -1) {
                data = {
                    value: ecData.get(dragged, 'value'),
                    name: ecData.get(dragged, 'name')
                };
                series[seriesIndex].data.push(data);
                legend && legend.add(data.name, dragged.style.color || dragged.style.strokeColor);
            } else {
                var accMath = require('../util/accMath');
                data = series[seriesIndex].data[dataIndex];
                legend && legend.del(data.name);
                data.name += this.option.nameConnector + ecData.get(dragged, 'name');
                value = ecData.get(dragged, 'value');
                for (var i = 0; i < value.length; i++) {
                    data.value[i] = accMath.accAdd(data.value[i], value[i]);
                }
                legend && legend.add(data.name, dragged.style.color || dragged.style.strokeColor);
            }
            status.dragIn = status.dragIn || true;
            this.isDrop = false;
            return;
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.series = newOption.series;
            }
            this.backupShapeList();
            this._buildShape();
        }
    };
    zrUtil.inherits(Radar, ChartBase);
    require('../chart').define('radar', Radar);
    return Radar;
});define('echarts/component/polar', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Line',
    'zrender/shape/Polygon',
    'zrender/shape/Circle',
    'zrender/shape/Ring',
    '../config',
    'zrender/tool/util',
    '../util/coordinates',
    '../util/accMath',
    '../util/smartSteps',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var LineShape = require('zrender/shape/Line');
    var PolygonShape = require('zrender/shape/Polygon');
    var Circle = require('zrender/shape/Circle');
    var Ring = require('zrender/shape/Ring');
    var ecConfig = require('../config');
    ecConfig.polar = {
        zlevel: 0,
        z: 0,
        center: [
            '50%',
            '50%'
        ],
        radius: '75%',
        startAngle: 90,
        boundaryGap: [
            0,
            0
        ],
        splitNumber: 5,
        name: {
            show: true,
            textStyle: { color: '#333' }
        },
        axisLine: {
            show: true,
            lineStyle: {
                color: '#ccc',
                width: 1,
                type: 'solid'
            }
        },
        axisLabel: {
            show: false,
            textStyle: { color: '#333' }
        },
        splitArea: {
            show: true,
            areaStyle: {
                color: [
                    'rgba(250,250,250,0.3)',
                    'rgba(200,200,200,0.3)'
                ]
            }
        },
        splitLine: {
            show: true,
            lineStyle: {
                width: 1,
                color: '#ccc'
            }
        },
        type: 'polygon'
    };
    var zrUtil = require('zrender/tool/util');
    var ecCoordinates = require('../util/coordinates');
    function Polar(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.refresh(option);
    }
    Polar.prototype = {
        type: ecConfig.COMPONENT_TYPE_POLAR,
        _buildShape: function () {
            for (var i = 0; i < this.polar.length; i++) {
                this._index = i;
                this.reformOption(this.polar[i]);
                this._queryTarget = [
                    this.polar[i],
                    this.option
                ];
                this._createVector(i);
                this._buildSpiderWeb(i);
                this._buildText(i);
                this._adjustIndicatorValue(i);
                this._addAxisLabel(i);
            }
            for (var i = 0; i < this.shapeList.length; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _createVector: function (index) {
            var item = this.polar[index];
            var indicator = this.deepQuery(this._queryTarget, 'indicator');
            var length = indicator.length;
            var startAngle = item.startAngle;
            var dStep = 2 * Math.PI / length;
            var radius = this._getRadius();
            var __ecIndicator = item.__ecIndicator = [];
            var vector;
            for (var i = 0; i < length; i++) {
                vector = ecCoordinates.polar2cartesian(radius, startAngle * Math.PI / 180 + dStep * i);
                __ecIndicator.push({
                    vector: [
                        vector[1],
                        -vector[0]
                    ]
                });
            }
        },
        _getRadius: function () {
            var item = this.polar[this._index];
            return this.parsePercent(item.radius, Math.min(this.zr.getWidth(), this.zr.getHeight()) / 2);
        },
        _buildSpiderWeb: function (index) {
            var item = this.polar[index];
            var __ecIndicator = item.__ecIndicator;
            var splitArea = item.splitArea;
            var splitLine = item.splitLine;
            var center = this.getCenter(index);
            var splitNumber = item.splitNumber;
            var strokeColor = splitLine.lineStyle.color;
            var lineWidth = splitLine.lineStyle.width;
            var show = splitLine.show;
            var axisLine = this.deepQuery(this._queryTarget, 'axisLine');
            this._addArea(__ecIndicator, splitNumber, center, splitArea, strokeColor, lineWidth, show);
            axisLine.show && this._addLine(__ecIndicator, center, axisLine);
        },
        _addAxisLabel: function (index) {
            var accMath = require('../util/accMath');
            var item = this.polar[index];
            var indicator = this.deepQuery(this._queryTarget, 'indicator');
            var __ecIndicator = item.__ecIndicator;
            var axisLabel;
            var vector;
            var style;
            var newStyle;
            var splitNumber = this.deepQuery(this._queryTarget, 'splitNumber');
            var center = this.getCenter(index);
            var vector;
            var value;
            var text;
            var theta;
            var offset;
            var interval;
            for (var i = 0; i < indicator.length; i++) {
                axisLabel = this.deepQuery([
                    indicator[i],
                    item,
                    this.option
                ], 'axisLabel');
                if (axisLabel.show) {
                    var textStyle = this.deepQuery([
                        axisLabel,
                        item,
                        this.option
                    ], 'textStyle');
                    style = {};
                    style.textFont = this.getFont(textStyle);
                    style.color = textStyle.color;
                    style = zrUtil.merge(style, axisLabel);
                    style.lineWidth = style.width;
                    vector = __ecIndicator[i].vector;
                    value = __ecIndicator[i].value;
                    theta = i / indicator.length * 2 * Math.PI;
                    offset = axisLabel.offset || 10;
                    interval = axisLabel.interval || 0;
                    if (!value) {
                        return;
                    }
                    for (var j = 1; j <= splitNumber; j += interval + 1) {
                        newStyle = zrUtil.merge({}, style);
                        text = accMath.accAdd(value.min, accMath.accMul(value.step, j));
                        newStyle.text = this.numAddCommas(text);
                        newStyle.x = j * vector[0] / splitNumber + Math.cos(theta) * offset + center[0];
                        newStyle.y = j * vector[1] / splitNumber + Math.sin(theta) * offset + center[1];
                        this.shapeList.push(new TextShape({
                            zlevel: this.getZlevelBase(),
                            z: this.getZBase(),
                            style: newStyle,
                            draggable: false,
                            hoverable: false
                        }));
                    }
                }
            }
        },
        _buildText: function (index) {
            var item = this.polar[index];
            var __ecIndicator = item.__ecIndicator;
            var vector;
            var indicator = this.deepQuery(this._queryTarget, 'indicator');
            var center = this.getCenter(index);
            var style;
            var textAlign;
            var name;
            var rotation;
            var x = 0;
            var y = 0;
            var margin;
            var textStyle;
            for (var i = 0; i < indicator.length; i++) {
                name = this.deepQuery([
                    indicator[i],
                    item,
                    this.option
                ], 'name');
                if (!name.show) {
                    continue;
                }
                textStyle = this.deepQuery([
                    name,
                    item,
                    this.option
                ], 'textStyle');
                style = {};
                style.textFont = this.getFont(textStyle);
                style.color = textStyle.color;
                if (typeof name.formatter == 'function') {
                    style.text = name.formatter.call(this.myChart, indicator[i].text, i);
                } else if (typeof name.formatter == 'string') {
                    style.text = name.formatter.replace('{value}', indicator[i].text);
                } else {
                    style.text = indicator[i].text;
                }
                __ecIndicator[i].text = style.text;
                vector = __ecIndicator[i].vector;
                if (Math.round(vector[0]) > 0) {
                    textAlign = 'left';
                } else if (Math.round(vector[0]) < 0) {
                    textAlign = 'right';
                } else {
                    textAlign = 'center';
                }
                if (name.margin == null) {
                    vector = this._mapVector(vector, center, 1.1);
                } else {
                    margin = name.margin;
                    x = vector[0] > 0 ? margin : -margin;
                    y = vector[1] > 0 ? margin : -margin;
                    x = vector[0] === 0 ? 0 : x;
                    y = vector[1] === 0 ? 0 : y;
                    vector = this._mapVector(vector, center, 1);
                }
                style.textAlign = textAlign;
                style.x = vector[0] + x;
                style.y = vector[1] + y;
                if (name.rotate) {
                    rotation = [
                        name.rotate / 180 * Math.PI,
                        vector[0],
                        vector[1]
                    ];
                } else {
                    rotation = [
                        0,
                        0,
                        0
                    ];
                }
                this.shapeList.push(new TextShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    style: style,
                    draggable: false,
                    hoverable: false,
                    rotation: rotation
                }));
            }
        },
        getIndicatorText: function (polarIndex, indicatorIndex) {
            return this.polar[polarIndex] && this.polar[polarIndex].__ecIndicator[indicatorIndex] && this.polar[polarIndex].__ecIndicator[indicatorIndex].text;
        },
        getDropBox: function (index) {
            var index = index || 0;
            var item = this.polar[index];
            var center = this.getCenter(index);
            var __ecIndicator = item.__ecIndicator;
            var len = __ecIndicator.length;
            var pointList = [];
            var vector;
            var shape;
            var type = item.type;
            if (type == 'polygon') {
                for (var i = 0; i < len; i++) {
                    vector = __ecIndicator[i].vector;
                    pointList.push(this._mapVector(vector, center, 1.2));
                }
                shape = this._getShape(pointList, 'fill', 'rgba(0,0,0,0)', '', 1);
            } else if (type == 'circle') {
                shape = this._getCircle('', 1, 1.2, center, 'fill', 'rgba(0,0,0,0)');
            }
            return shape;
        },
        _addArea: function (__ecIndicator, splitNumber, center, splitArea, strokeColor, lineWidth, show) {
            var shape;
            var scale;
            var scale1;
            var pointList;
            var type = this.deepQuery(this._queryTarget, 'type');
            for (var i = 0; i < splitNumber; i++) {
                scale = (splitNumber - i) / splitNumber;
                if (show) {
                    if (type == 'polygon') {
                        pointList = this._getPointList(__ecIndicator, scale, center);
                        shape = this._getShape(pointList, 'stroke', '', strokeColor, lineWidth);
                    } else if (type == 'circle') {
                        shape = this._getCircle(strokeColor, lineWidth, scale, center, 'stroke');
                    }
                    this.shapeList.push(shape);
                }
                if (splitArea.show) {
                    scale1 = (splitNumber - i - 1) / splitNumber;
                    this._addSplitArea(__ecIndicator, splitArea, scale, scale1, center, i);
                }
            }
        },
        _getCircle: function (strokeColor, lineWidth, scale, center, brushType, color) {
            var radius = this._getRadius();
            return new Circle({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: center[0],
                    y: center[1],
                    r: radius * scale,
                    brushType: brushType,
                    strokeColor: strokeColor,
                    lineWidth: lineWidth,
                    color: color
                },
                hoverable: false,
                draggable: false
            });
        },
        _getRing: function (color, scale0, scale1, center) {
            var radius = this._getRadius();
            return new Ring({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: center[0],
                    y: center[1],
                    r: scale0 * radius,
                    r0: scale1 * radius,
                    color: color,
                    brushType: 'fill'
                },
                hoverable: false,
                draggable: false
            });
        },
        _getPointList: function (__ecIndicator, scale, center) {
            var pointList = [];
            var len = __ecIndicator.length;
            var vector;
            for (var i = 0; i < len; i++) {
                vector = __ecIndicator[i].vector;
                pointList.push(this._mapVector(vector, center, scale));
            }
            return pointList;
        },
        _getShape: function (pointList, brushType, color, strokeColor, lineWidth) {
            return new PolygonShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    pointList: pointList,
                    brushType: brushType,
                    color: color,
                    strokeColor: strokeColor,
                    lineWidth: lineWidth
                },
                hoverable: false,
                draggable: false
            });
        },
        _addSplitArea: function (__ecIndicator, splitArea, scale, scale1, center, colorInd) {
            var indLen = __ecIndicator.length;
            var color;
            var colorArr = splitArea.areaStyle.color;
            var colorLen;
            var vector;
            var vector1;
            var pointList = [];
            var indLen = __ecIndicator.length;
            var shape;
            var type = this.deepQuery(this._queryTarget, 'type');
            if (typeof colorArr == 'string') {
                colorArr = [colorArr];
            }
            colorLen = colorArr.length;
            color = colorArr[colorInd % colorLen];
            if (type == 'polygon') {
                for (var i = 0; i < indLen; i++) {
                    pointList = [];
                    vector = __ecIndicator[i].vector;
                    vector1 = __ecIndicator[(i + 1) % indLen].vector;
                    pointList.push(this._mapVector(vector, center, scale));
                    pointList.push(this._mapVector(vector, center, scale1));
                    pointList.push(this._mapVector(vector1, center, scale1));
                    pointList.push(this._mapVector(vector1, center, scale));
                    shape = this._getShape(pointList, 'fill', color, '', 1);
                    this.shapeList.push(shape);
                }
            } else if (type == 'circle') {
                shape = this._getRing(color, scale, scale1, center);
                this.shapeList.push(shape);
            }
        },
        _mapVector: function (vector, center, scale) {
            return [
                vector[0] * scale + center[0],
                vector[1] * scale + center[1]
            ];
        },
        getCenter: function (index) {
            var index = index || 0;
            return this.parseCenter(this.zr, this.polar[index].center);
        },
        _addLine: function (__ecIndicator, center, axisLine) {
            var indLen = __ecIndicator.length;
            var line;
            var vector;
            var lineStyle = axisLine.lineStyle;
            var strokeColor = lineStyle.color;
            var lineWidth = lineStyle.width;
            var lineType = lineStyle.type;
            for (var i = 0; i < indLen; i++) {
                vector = __ecIndicator[i].vector;
                line = this._getLine(center[0], center[1], vector[0] + center[0], vector[1] + center[1], strokeColor, lineWidth, lineType);
                this.shapeList.push(line);
            }
        },
        _getLine: function (xStart, yStart, xEnd, yEnd, strokeColor, lineWidth, lineType) {
            return new LineShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    xStart: xStart,
                    yStart: yStart,
                    xEnd: xEnd,
                    yEnd: yEnd,
                    strokeColor: strokeColor,
                    lineWidth: lineWidth,
                    lineType: lineType
                },
                hoverable: false
            });
        },
        _adjustIndicatorValue: function (index) {
            var item = this.polar[index];
            var indicator = this.deepQuery(this._queryTarget, 'indicator');
            var len = indicator.length;
            var __ecIndicator = item.__ecIndicator;
            var max;
            var min;
            var data = this._getSeriesData(index);
            var boundaryGap = item.boundaryGap;
            var splitNumber = item.splitNumber;
            var scale = item.scale;
            var smartSteps = require('../util/smartSteps');
            for (var i = 0; i < len; i++) {
                if (typeof indicator[i].max == 'number') {
                    max = indicator[i].max;
                    min = indicator[i].min || 0;
                } else {
                    var value = this._findValue(data, i, splitNumber, boundaryGap);
                    min = value.min;
                    max = value.max;
                }
                if (!scale && min >= 0 && max >= 0) {
                    min = 0;
                }
                if (!scale && min <= 0 && max <= 0) {
                    max = 0;
                }
                var stepOpt = smartSteps(min, max, splitNumber);
                __ecIndicator[i].value = {
                    min: stepOpt.min,
                    max: stepOpt.max,
                    step: stepOpt.step
                };
            }
        },
        _getSeriesData: function (index) {
            var data = [];
            var serie;
            var serieData;
            var legend = this.component.legend;
            var polarIndex;
            for (var i = 0; i < this.series.length; i++) {
                serie = this.series[i];
                if (serie.type != ecConfig.CHART_TYPE_RADAR) {
                    continue;
                }
                serieData = serie.data || [];
                for (var j = 0; j < serieData.length; j++) {
                    polarIndex = this.deepQuery([
                        serieData[j],
                        serie,
                        this.option
                    ], 'polarIndex') || 0;
                    if (polarIndex == index && (!legend || legend.isSelected(serieData[j].name))) {
                        data.push(serieData[j]);
                    }
                }
            }
            return data;
        },
        _findValue: function (data, index, splitNumber, boundaryGap) {
            var max;
            var min;
            var one;
            if (!data || data.length === 0) {
                return;
            }
            function _compare(item) {
                (item > max || max === undefined) && (max = item);
                (item < min || min === undefined) && (min = item);
            }
            if (data.length == 1) {
                min = 0;
            }
            if (data.length != 1) {
                for (var i = 0; i < data.length; i++) {
                    _compare(this.getDataFromOption(data[i].value[index]));
                }
            } else {
                one = data[0];
                for (var i = 0; i < one.value.length; i++) {
                    _compare(this.getDataFromOption(one.value[i]));
                }
            }
            var gap = Math.abs(max - min);
            min = min - Math.abs(gap * boundaryGap[0]);
            max = max + Math.abs(gap * boundaryGap[1]);
            if (min === max) {
                if (max === 0) {
                    max = 1;
                } else if (max > 0) {
                    min = max / splitNumber;
                } else {
                    max = max / splitNumber;
                }
            }
            return {
                max: max,
                min: min
            };
        },
        getVector: function (polarIndex, indicatorIndex, value) {
            polarIndex = polarIndex || 0;
            indicatorIndex = indicatorIndex || 0;
            var __ecIndicator = this.polar[polarIndex].__ecIndicator;
            if (indicatorIndex >= __ecIndicator.length) {
                return;
            }
            var indicator = this.polar[polarIndex].__ecIndicator[indicatorIndex];
            var center = this.getCenter(polarIndex);
            var vector = indicator.vector;
            var max = indicator.value.max;
            var min = indicator.value.min;
            var alpha;
            if (typeof value == 'undefined') {
                return center;
            }
            switch (value) {
            case 'min':
                value = min;
                break;
            case 'max':
                value = max;
                break;
            case 'center':
                value = (max + min) / 2;
                break;
            }
            if (max != min) {
                alpha = (value - min) / (max - min);
            } else {
                alpha = 0.5;
            }
            return this._mapVector(vector, center, alpha);
        },
        isInside: function (vector) {
            var polar = this.getNearestIndex(vector);
            if (polar) {
                return polar.polarIndex;
            }
            return -1;
        },
        getNearestIndex: function (vector) {
            var item;
            var center;
            var radius;
            var polarVector;
            var startAngle;
            var indicator;
            var len;
            var angle;
            var finalAngle;
            for (var i = 0; i < this.polar.length; i++) {
                item = this.polar[i];
                center = this.getCenter(i);
                if (vector[0] == center[0] && vector[1] == center[1]) {
                    return {
                        polarIndex: i,
                        valueIndex: 0
                    };
                }
                radius = this._getRadius();
                startAngle = item.startAngle;
                indicator = item.indicator;
                len = indicator.length;
                angle = 2 * Math.PI / len;
                polarVector = ecCoordinates.cartesian2polar(vector[0] - center[0], center[1] - vector[1]);
                if (vector[0] - center[0] < 0) {
                    polarVector[1] += Math.PI;
                }
                if (polarVector[1] < 0) {
                    polarVector[1] += 2 * Math.PI;
                }
                finalAngle = polarVector[1] - startAngle / 180 * Math.PI + Math.PI * 2;
                if (Math.abs(Math.cos(finalAngle % (angle / 2))) * radius > polarVector[0]) {
                    return {
                        polarIndex: i,
                        valueIndex: Math.floor((finalAngle + angle / 2) / angle) % len
                    };
                }
            }
        },
        getIndicator: function (index) {
            var index = index || 0;
            return this.polar[index].indicator;
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.polar = this.option.polar;
                this.series = this.option.series;
            }
            this.clear();
            this._buildShape();
        }
    };
    zrUtil.inherits(Polar, Base);
    require('../component').define('polar', Polar);
    return Polar;
});define('zrender/shape/Ring', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var Ring = function (options) {
        Base.call(this, options);
    };
    Ring.prototype = {
        type: 'ring',
        buildPath: function (ctx, style) {
            ctx.arc(style.x, style.y, style.r, 0, Math.PI * 2, false);
            ctx.moveTo(style.x + style.r0, style.y);
            ctx.arc(style.x, style.y, style.r0, 0, Math.PI * 2, true);
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
            style.__rect = {
                x: Math.round(style.x - style.r - lineWidth / 2),
                y: Math.round(style.y - style.r - lineWidth / 2),
                width: style.r * 2 + lineWidth,
                height: style.r * 2 + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Ring, Base);
    return Ring;
});define('echarts/util/coordinates', [
    'require',
    'zrender/tool/math'
], function (require) {
    var zrMath = require('zrender/tool/math');
    function polar2cartesian(r, theta) {
        return [
            r * zrMath.sin(theta),
            r * zrMath.cos(theta)
        ];
    }
    function cartesian2polar(x, y) {
        return [
            Math.sqrt(x * x + y * y),
            Math.atan(y / x)
        ];
    }
    return {
        polar2cartesian: polar2cartesian,
        cartesian2polar: cartesian2polar
    };
});define('echarts/util/smartSteps', [], function () {
    var mySteps = [
        10,
        20,
        25,
        50
    ];
    var mySections = [
        4,
        5,
        6
    ];
    var custOpts;
    var custSteps;
    var custSecs;
    var minLocked;
    var maxLocked;
    var MT = Math;
    var MATH_ROUND = MT.round;
    var MATH_FLOOR = MT.floor;
    var MATH_CEIL = MT.ceil;
    var MATH_ABS = MT.abs;
    function MATH_LOG(n) {
        return MT.log(MATH_ABS(n)) / MT.LN10;
    }
    function MATH_POW(n) {
        return MT.pow(10, n);
    }
    function MATH_ISINT(n) {
        return n === MATH_FLOOR(n);
    }
    function smartSteps(min, max, section, opts) {
        custOpts = opts || {};
        custSteps = custOpts.steps || mySteps;
        custSecs = custOpts.secs || mySections;
        section = MATH_ROUND(+section || 0) % 99;
        min = +min || 0;
        max = +max || 0;
        minLocked = maxLocked = 0;
        if ('min' in custOpts) {
            min = +custOpts.min || 0;
            minLocked = 1;
        }
        if ('max' in custOpts) {
            max = +custOpts.max || 0;
            maxLocked = 1;
        }
        if (min > max) {
            max = [
                min,
                min = max
            ][0];
        }
        var span = max - min;
        if (minLocked && maxLocked) {
            return bothLocked(min, max, section);
        }
        if (span < (section || 5)) {
            if (MATH_ISINT(min) && MATH_ISINT(max)) {
                return forInteger(min, max, section);
            } else if (span === 0) {
                return forSpan0(min, max, section);
            }
        }
        return coreCalc(min, max, section);
    }
    function makeResult(newMin, newMax, section, expon) {
        expon = expon || 0;
        var expStep = expNum((newMax - newMin) / section, -1);
        var expMin = expNum(newMin, -1, 1);
        var expMax = expNum(newMax, -1);
        var minExp = MT.min(expStep.e, expMin.e, expMax.e);
        if (expMin.c === 0) {
            minExp = MT.min(expStep.e, expMax.e);
        } else if (expMax.c === 0) {
            minExp = MT.min(expStep.e, expMin.e);
        }
        expFixTo(expStep, {
            c: 0,
            e: minExp
        });
        expFixTo(expMin, expStep, 1);
        expFixTo(expMax, expStep);
        expon += minExp;
        newMin = expMin.c;
        newMax = expMax.c;
        var step = (newMax - newMin) / section;
        var zoom = MATH_POW(expon);
        var fixTo = 0;
        var points = [];
        for (var i = section + 1; i--;) {
            points[i] = (newMin + step * i) * zoom;
        }
        if (expon < 0) {
            fixTo = decimals(zoom);
            step = +(step * zoom).toFixed(fixTo);
            newMin = +(newMin * zoom).toFixed(fixTo);
            newMax = +(newMax * zoom).toFixed(fixTo);
            for (var i = points.length; i--;) {
                points[i] = points[i].toFixed(fixTo);
                +points[i] === 0 && (points[i] = '0');
            }
        } else {
            newMin *= zoom;
            newMax *= zoom;
            step *= zoom;
        }
        custSecs = 0;
        custSteps = 0;
        custOpts = 0;
        return {
            min: newMin,
            max: newMax,
            secs: section,
            step: step,
            fix: fixTo,
            exp: expon,
            pnts: points
        };
    }
    function expNum(num, digit, byFloor) {
        digit = MATH_ROUND(digit % 10) || 2;
        if (digit < 0) {
            if (MATH_ISINT(num)) {
                digit = ('' + MATH_ABS(num)).replace(/0+$/, '').length || 1;
            } else {
                num = num.toFixed(15).replace(/0+$/, '');
                digit = num.replace('.', '').replace(/^[-0]+/, '').length;
                num = +num;
            }
        }
        var expon = MATH_FLOOR(MATH_LOG(num)) - digit + 1;
        var cNum = +(num * MATH_POW(-expon)).toFixed(15) || 0;
        cNum = byFloor ? MATH_FLOOR(cNum) : MATH_CEIL(cNum);
        !cNum && (expon = 0);
        if (('' + MATH_ABS(cNum)).length > digit) {
            expon += 1;
            cNum /= 10;
        }
        return {
            c: cNum,
            e: expon
        };
    }
    function expFixTo(expnum1, expnum2, byFloor) {
        var deltaExp = expnum2.e - expnum1.e;
        if (deltaExp) {
            expnum1.e += deltaExp;
            expnum1.c *= MATH_POW(-deltaExp);
            expnum1.c = byFloor ? MATH_FLOOR(expnum1.c) : MATH_CEIL(expnum1.c);
        }
    }
    function expFixMin(expnum1, expnum2, byFloor) {
        if (expnum1.e < expnum2.e) {
            expFixTo(expnum2, expnum1, byFloor);
        } else {
            expFixTo(expnum1, expnum2, byFloor);
        }
    }
    function getCeil(num, rounds) {
        rounds = rounds || mySteps;
        num = expNum(num);
        var cNum = num.c;
        var i = 0;
        while (cNum > rounds[i]) {
            i++;
        }
        if (!rounds[i]) {
            cNum /= 10;
            num.e += 1;
            i = 0;
            while (cNum > rounds[i]) {
                i++;
            }
        }
        num.c = rounds[i];
        return num;
    }
    function coreCalc(min, max, section) {
        var step;
        var secs = section || +custSecs.slice(-1);
        var expStep = getCeil((max - min) / secs, custSteps);
        var expSpan = expNum(max - min);
        var expMin = expNum(min, -1, 1);
        var expMax = expNum(max, -1);
        expFixTo(expSpan, expStep);
        expFixTo(expMin, expStep, 1);
        expFixTo(expMax, expStep);
        if (!section) {
            secs = look4sections(expMin, expMax);
        } else {
            step = look4step(expMin, expMax, secs);
        }
        if (MATH_ISINT(min) && MATH_ISINT(max) && min * max >= 0) {
            if (max - min < secs) {
                return forInteger(min, max, secs);
            }
            secs = tryForInt(min, max, section, expMin, expMax, secs);
        }
        var arrMM = cross0(min, max, expMin.c, expMax.c);
        expMin.c = arrMM[0];
        expMax.c = arrMM[1];
        if (minLocked || maxLocked) {
            singleLocked(min, max, expMin, expMax);
        }
        return makeResult(expMin.c, expMax.c, secs, expMax.e);
    }
    function look4sections(expMin, expMax) {
        var section;
        var tmpStep, tmpMin, tmpMax;
        var reference = [];
        for (var i = custSecs.length; i--;) {
            section = custSecs[i];
            tmpStep = getCeil((expMax.c - expMin.c) / section, custSteps);
            tmpStep = tmpStep.c * MATH_POW(tmpStep.e);
            tmpMin = MATH_FLOOR(expMin.c / tmpStep) * tmpStep;
            tmpMax = MATH_CEIL(expMax.c / tmpStep) * tmpStep;
            reference[i] = {
                min: tmpMin,
                max: tmpMax,
                step: tmpStep,
                span: tmpMax - tmpMin
            };
        }
        reference.sort(function (a, b) {
            var delta = a.span - b.span;
            if (delta === 0) {
                delta = a.step - b.step;
            }
            return delta;
        });
        reference = reference[0];
        section = reference.span / reference.step;
        expMin.c = reference.min;
        expMax.c = reference.max;
        return section < 3 ? section * 2 : section;
    }
    function look4step(expMin, expMax, secs) {
        var span;
        var tmpMax;
        var tmpMin = expMax.c;
        var tmpStep = (expMax.c - expMin.c) / secs - 1;
        while (tmpMin > expMin.c) {
            tmpStep = getCeil(tmpStep + 1, custSteps);
            tmpStep = tmpStep.c * MATH_POW(tmpStep.e);
            span = tmpStep * secs;
            tmpMax = MATH_CEIL(expMax.c / tmpStep) * tmpStep;
            tmpMin = tmpMax - span;
        }
        var deltaMin = expMin.c - tmpMin;
        var deltaMax = tmpMax - expMax.c;
        var deltaDelta = deltaMin - deltaMax;
        if (deltaDelta > tmpStep * 1.1) {
            deltaDelta = MATH_ROUND(deltaDelta / tmpStep / 2) * tmpStep;
            tmpMin += deltaDelta;
            tmpMax += deltaDelta;
        }
        expMin.c = tmpMin;
        expMax.c = tmpMax;
        return tmpStep;
    }
    function tryForInt(min, max, section, expMin, expMax, secs) {
        var span = expMax.c - expMin.c;
        var step = span / secs * MATH_POW(expMax.e);
        if (!MATH_ISINT(step)) {
            step = MATH_FLOOR(step);
            span = step * secs;
            if (span < max - min) {
                step += 1;
                span = step * secs;
                if (!section && step * (secs - 1) >= max - min) {
                    secs -= 1;
                    span = step * secs;
                }
            }
            if (span >= max - min) {
                var delta = span - (max - min);
                expMin.c = MATH_ROUND(min - delta / 2);
                expMax.c = MATH_ROUND(max + delta / 2);
                expMin.e = 0;
                expMax.e = 0;
            }
        }
        return secs;
    }
    function forInteger(min, max, section) {
        section = section || 5;
        if (minLocked) {
            max = min + section;
        } else if (maxLocked) {
            min = max - section;
        } else {
            var delta = section - (max - min);
            var newMin = MATH_ROUND(min - delta / 2);
            var newMax = MATH_ROUND(max + delta / 2);
            var arrMM = cross0(min, max, newMin, newMax);
            min = arrMM[0];
            max = arrMM[1];
        }
        return makeResult(min, max, section);
    }
    function forSpan0(min, max, section) {
        section = section || 5;
        var delta = MT.min(MATH_ABS(max / section), section) / 2.1;
        if (minLocked) {
            max = min + delta;
        } else if (maxLocked) {
            min = max - delta;
        } else {
            min = min - delta;
            max = max + delta;
        }
        return coreCalc(min, max, section);
    }
    function cross0(min, max, newMin, newMax) {
        if (min >= 0 && newMin < 0) {
            newMax -= newMin;
            newMin = 0;
        } else if (max <= 0 && newMax > 0) {
            newMin -= newMax;
            newMax = 0;
        }
        return [
            newMin,
            newMax
        ];
    }
    function decimals(num) {
        num = (+num).toFixed(15).split('.');
        return num.pop().replace(/0+$/, '').length;
    }
    function singleLocked(min, max, emin, emax) {
        if (minLocked) {
            var expMin = expNum(min, 4, 1);
            if (emin.e - expMin.e > 6) {
                expMin = {
                    c: 0,
                    e: emin.e
                };
            }
            expFixMin(emin, expMin);
            expFixMin(emax, expMin);
            emax.c += expMin.c - emin.c;
            emin.c = expMin.c;
        } else if (maxLocked) {
            var expMax = expNum(max, 4);
            if (emax.e - expMax.e > 6) {
                expMax = {
                    c: 0,
                    e: emax.e
                };
            }
            expFixMin(emin, expMax);
            expFixMin(emax, expMax);
            emin.c += expMax.c - emax.c;
            emax.c = expMax.c;
        }
    }
    function bothLocked(min, max, section) {
        var trySecs = section ? [section] : custSecs;
        var span = max - min;
        if (span === 0) {
            max = expNum(max, 3);
            section = trySecs[0];
            max.c = MATH_ROUND(max.c + section / 2);
            return makeResult(max.c - section, max.c, section, max.e);
        }
        if (MATH_ABS(max / span) < 0.000001) {
            max = 0;
        }
        if (MATH_ABS(min / span) < 0.000001) {
            min = 0;
        }
        var step, deltaSpan, score;
        var scoreS = [
            [
                5,
                10
            ],
            [
                10,
                2
            ],
            [
                50,
                10
            ],
            [
                100,
                2
            ]
        ];
        var reference = [];
        var debugLog = [];
        var expSpan = expNum(max - min, 3);
        var expMin = expNum(min, -1, 1);
        var expMax = expNum(max, -1);
        expFixTo(expMin, expSpan, 1);
        expFixTo(expMax, expSpan);
        span = expMax.c - expMin.c;
        expSpan.c = span;
        for (var i = trySecs.length; i--;) {
            section = trySecs[i];
            step = MATH_CEIL(span / section);
            deltaSpan = step * section - span;
            score = (deltaSpan + 3) * 3;
            score += (section - trySecs[0] + 2) * 2;
            if (section % 5 === 0) {
                score -= 10;
            }
            for (var j = scoreS.length; j--;) {
                if (step % scoreS[j][0] === 0) {
                    score /= scoreS[j][1];
                }
            }
            debugLog[i] = [
                section,
                step,
                deltaSpan,
                score
            ].join();
            reference[i] = {
                secs: section,
                step: step,
                delta: deltaSpan,
                score: score
            };
        }
        reference.sort(function (a, b) {
            return a.score - b.score;
        });
        reference = reference[0];
        expMin.c = MATH_ROUND(expMin.c - reference.delta / 2);
        expMax.c = MATH_ROUND(expMax.c + reference.delta / 2);
        return makeResult(expMin.c, expMax.c, reference.secs, expSpan.e);
    }
    return smartSteps;
});