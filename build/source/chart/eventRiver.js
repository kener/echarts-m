define('echarts/chart/eventRiver', [
    'require',
    './base',
    '../layout/eventRiver',
    'zrender/shape/Polygon',
    '../component/axis',
    '../component/grid',
    '../component/dataZoom',
    '../config',
    '../util/ecData',
    '../util/date',
    'zrender/tool/util',
    'zrender/tool/color',
    '../chart'
], function (require) {
    var ChartBase = require('./base');
    var eventRiverLayout = require('../layout/eventRiver');
    var PolygonShape = require('zrender/shape/Polygon');
    require('../component/axis');
    require('../component/grid');
    require('../component/dataZoom');
    var ecConfig = require('../config');
    ecConfig.eventRiver = {
        zlevel: 0,
        z: 2,
        clickable: true,
        legendHoverLink: true,
        itemStyle: {
            normal: {
                borderColor: 'rgba(0,0,0,0)',
                borderWidth: 1,
                label: {
                    show: true,
                    position: 'inside',
                    formatter: '{b}'
                }
            },
            emphasis: {
                borderColor: 'rgba(0,0,0,0)',
                borderWidth: 1,
                label: { show: true }
            }
        }
    };
    var ecData = require('../util/ecData');
    var ecDate = require('../util/date');
    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');
    function EventRiver(ecTheme, messageCenter, zr, option, myChart) {
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._ondragend = function () {
            self.isDragend = true;
        };
        this.refresh(option);
    }
    EventRiver.prototype = {
        type: ecConfig.CHART_TYPE_EVENTRIVER,
        _buildShape: function () {
            var series = this.series;
            this.selectedMap = {};
            this._dataPreprocessing();
            var legend = this.component.legend;
            var eventRiverSeries = [];
            for (var i = 0; i < series.length; i++) {
                if (series[i].type === this.type) {
                    series[i] = this.reformOption(series[i]);
                    this.legendHoverLink = series[i].legendHoverLink || this.legendHoverLink;
                    var serieName = series[i].name || '';
                    this.selectedMap[serieName] = legend ? legend.isSelected(serieName) : true;
                    if (!this.selectedMap[serieName]) {
                        continue;
                    }
                    this.buildMark(i);
                    eventRiverSeries.push(this.series[i]);
                }
            }
            eventRiverLayout(eventRiverSeries, this._intervalX, this.component.grid.getArea());
            this._drawEventRiver();
            this.addShapeList();
        },
        _dataPreprocessing: function () {
            var series = this.series;
            var xAxis;
            var evolutionList;
            for (var i = 0, iLen = series.length; i < iLen; i++) {
                if (series[i].type === this.type) {
                    xAxis = this.component.xAxis.getAxis(series[i].xAxisIndex || 0);
                    for (var j = 0, jLen = series[i].eventList.length; j < jLen; j++) {
                        evolutionList = series[i].eventList[j].evolution;
                        for (var k = 0, kLen = evolutionList.length; k < kLen; k++) {
                            evolutionList[k].timeScale = xAxis.getCoord(ecDate.getNewDate(evolutionList[k].time) - 0);
                            evolutionList[k].valueScale = Math.pow(evolutionList[k].value, 0.8);
                        }
                    }
                }
            }
            this._intervalX = Math.round(this.component.grid.getWidth() / 40);
        },
        _drawEventRiver: function () {
            var series = this.series;
            for (var i = 0; i < series.length; i++) {
                var serieName = series[i].name || '';
                if (series[i].type === this.type && this.selectedMap[serieName]) {
                    for (var j = 0; j < series[i].eventList.length; j++) {
                        this._drawEventBubble(series[i].eventList[j], i, j);
                    }
                }
            }
        },
        _drawEventBubble: function (oneEvent, seriesIndex, dataIndex) {
            var series = this.series;
            var serie = series[seriesIndex];
            var serieName = serie.name || '';
            var data = serie.eventList[dataIndex];
            var queryTarget = [
                data,
                serie
            ];
            var legend = this.component.legend;
            var defaultColor = legend ? legend.getColor(serieName) : this.zr.getColor(seriesIndex);
            var normal = this.deepMerge(queryTarget, 'itemStyle.normal') || {};
            var emphasis = this.deepMerge(queryTarget, 'itemStyle.emphasis') || {};
            var normalColor = this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data) || defaultColor;
            var emphasisColor = this.getItemStyleColor(emphasis.color, seriesIndex, dataIndex, data) || (typeof normalColor === 'string' ? zrColor.lift(normalColor, -0.2) : normalColor);
            var pts = this._calculateControlPoints(oneEvent);
            var eventBubbleShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                clickable: this.deepQuery(queryTarget, 'clickable'),
                style: {
                    pointList: pts,
                    smooth: 'spline',
                    brushType: 'both',
                    lineJoin: 'round',
                    color: normalColor,
                    lineWidth: normal.borderWidth,
                    strokeColor: normal.borderColor
                },
                highlightStyle: {
                    color: emphasisColor,
                    lineWidth: emphasis.borderWidth,
                    strokeColor: emphasis.borderColor
                },
                draggable: 'vertical',
                ondragend: this._ondragend
            };
            eventBubbleShape = new PolygonShape(eventBubbleShape);
            this.addLabel(eventBubbleShape, serie, data, oneEvent.name);
            ecData.pack(eventBubbleShape, series[seriesIndex], seriesIndex, series[seriesIndex].eventList[dataIndex], dataIndex, series[seriesIndex].eventList[dataIndex].name);
            this.shapeList.push(eventBubbleShape);
        },
        _calculateControlPoints: function (oneEvent) {
            var intervalX = this._intervalX;
            var posY = oneEvent.y;
            var evolution = oneEvent.evolution;
            var n = evolution.length;
            if (n < 1) {
                return;
            }
            var time = [];
            var value = [];
            for (var i = 0; i < n; i++) {
                time.push(evolution[i].timeScale);
                value.push(evolution[i].valueScale);
            }
            var pts = [];
            pts.push([
                time[0],
                posY
            ]);
            var i = 0;
            for (i = 0; i < n - 1; i++) {
                pts.push([
                    (time[i] + time[i + 1]) / 2,
                    value[i] / -2 + posY
                ]);
            }
            pts.push([
                (time[i] + (time[i] + intervalX)) / 2,
                value[i] / -2 + posY
            ]);
            pts.push([
                time[i] + intervalX,
                posY
            ]);
            pts.push([
                (time[i] + (time[i] + intervalX)) / 2,
                value[i] / 2 + posY
            ]);
            for (i = n - 1; i > 0; i--) {
                pts.push([
                    (time[i] + time[i - 1]) / 2,
                    value[i - 1] / 2 + posY
                ]);
            }
            return pts;
        },
        ondragend: function (param, status) {
            if (!this.isDragend || !param.target) {
                return;
            }
            status.dragOut = true;
            status.dragIn = true;
            status.needRefresh = false;
            this.isDragend = false;
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
    zrUtil.inherits(EventRiver, ChartBase);
    require('../chart').define('eventRiver', EventRiver);
    return EventRiver;
});define('echarts/layout/eventRiver', ['require'], function (require) {
    function eventRiverLayout(series, intervalX, area) {
        var space = 5;
        var scale = intervalX;
        function importanceSort(a, b) {
            var x = a.importance;
            var y = b.importance;
            return x > y ? -1 : x < y ? 1 : 0;
        }
        function indexOf(array, value) {
            if (array.indexOf) {
                return array.indexOf(value);
            }
            for (var i = 0, len = array.length; i < len; i++) {
                if (array[i] === value) {
                    return i;
                }
            }
            return -1;
        }
        for (var i = 0; i < series.length; i++) {
            for (var j = 0; j < series[i].eventList.length; j++) {
                if (series[i].eventList[j].weight == null) {
                    series[i].eventList[j].weight = 1;
                }
                var importance = 0;
                for (var k = 0; k < series[i].eventList[j].evolution.length; k++) {
                    importance += series[i].eventList[j].evolution[k].valueScale;
                }
                series[i].eventList[j].importance = importance * series[i].eventList[j].weight;
            }
            series[i].eventList.sort(importanceSort);
        }
        for (var i = 0; i < series.length; i++) {
            if (series[i].weight == null) {
                series[i].weight = 1;
            }
            var importance = 0;
            for (var j = 0; j < series[i].eventList.length; j++) {
                importance += series[i].eventList[j].weight;
            }
            series[i].importance = importance * series[i].weight;
        }
        series.sort(importanceSort);
        var minTime = Number.MAX_VALUE;
        var maxTime = 0;
        for (var i = 0; i < series.length; i++) {
            for (var j = 0; j < series[i].eventList.length; j++) {
                for (var k = 0; k < series[i].eventList[j].evolution.length; k++) {
                    var time = series[i].eventList[j].evolution[k].timeScale;
                    minTime = Math.min(minTime, time);
                    maxTime = Math.max(maxTime, time);
                }
            }
        }
        var root = segmentTreeBuild(Math.floor(minTime), Math.ceil(maxTime));
        var totalMaxY = 0;
        for (var i = 0; i < series.length; i++) {
            for (var j = 0; j < series[i].eventList.length; j++) {
                var e = series[i].eventList[j];
                e.time = [];
                e.value = [];
                for (var k = 0; k < series[i].eventList[j].evolution.length; k++) {
                    e.time.push(series[i].eventList[j].evolution[k].timeScale);
                    e.value.push(series[i].eventList[j].evolution[k].valueScale);
                }
                var mxIndex = indexOf(e.value, Math.max.apply(Math, e.value));
                var maxY = segmentTreeQuery(root, e.time[mxIndex], e.time[mxIndex + 1]);
                var k = 0;
                e.y = maxY + e.value[mxIndex] / 2 + space;
                for (k = 0; k < e.time.length - 1; k++) {
                    var curMaxY = segmentTreeQuery(root, e.time[k], e.time[k + 1]);
                    if (e.y - e.value[k] / 2 - space < curMaxY) {
                        e.y = curMaxY + e.value[k] / 2 + space;
                    }
                }
                var curMaxY = segmentTreeQuery(root, e.time[k], e.time[k] + scale);
                if (e.y - e.value[k] / 2 - space < curMaxY) {
                    e.y = curMaxY + e.value[k] / 2 + space;
                }
                series[i].y = e.y;
                totalMaxY = Math.max(totalMaxY, e.y + e.value[mxIndex] / 2);
                for (k = 0; k < e.time.length - 1; k++) {
                    segmentTreeInsert(root, e.time[k], e.time[k + 1], e.y + e.value[k] / 2);
                }
                segmentTreeInsert(root, e.time[k], e.time[k] + scale, e.y + e.value[k] / 2);
            }
        }
        scaleY(series, area, totalMaxY, space);
    }
    function scaleY(series, area, maxY, space) {
        var yBase = area.y;
        var yScale = (area.height - space) / maxY;
        for (var i = 0; i < series.length; i++) {
            series[i].y = series[i].y * yScale + yBase;
            var eventList = series[i].eventList;
            for (var j = 0; j < eventList.length; j++) {
                eventList[j].y = eventList[j].y * yScale + yBase;
                var evolutionList = eventList[j].evolution;
                for (var k = 0; k < evolutionList.length; k++) {
                    evolutionList[k].valueScale *= yScale * 1;
                }
            }
        }
    }
    function segmentTreeBuild(left, right) {
        var root = {
            'left': left,
            'right': right,
            'leftChild': null,
            'rightChild': null,
            'maxValue': 0
        };
        if (left + 1 < right) {
            var mid = Math.round((left + right) / 2);
            root.leftChild = segmentTreeBuild(left, mid);
            root.rightChild = segmentTreeBuild(mid, right);
        }
        return root;
    }
    function segmentTreeQuery(root, left, right) {
        if (right - left < 1) {
            return 0;
        }
        var mid = Math.round((root.left + root.right) / 2);
        var result = 0;
        if (left == root.left && right == root.right) {
            result = root.maxValue;
        } else if (right <= mid && root.leftChild != null) {
            result = segmentTreeQuery(root.leftChild, left, right);
        } else if (left >= mid && root.rightChild != null) {
            result = segmentTreeQuery(root.rightChild, left, right);
        } else {
            var leftValue = 0;
            var rightValue = 0;
            if (root.leftChild != null) {
                leftValue = segmentTreeQuery(root.leftChild, left, mid);
            }
            if (root.rightChild != null) {
                rightValue = segmentTreeQuery(root.rightChild, mid, right);
            }
            result = leftValue > rightValue ? leftValue : rightValue;
        }
        return result;
    }
    function segmentTreeInsert(root, left, right, value) {
        if (root == null) {
            return;
        }
        var mid = Math.round((root.left + root.right) / 2);
        root.maxValue = root.maxValue > value ? root.maxValue : value;
        if (Math.floor(left * 10) == Math.floor(root.left * 10) && Math.floor(right * 10) == Math.floor(root.right * 10)) {
            return;
        } else if (right <= mid) {
            segmentTreeInsert(root.leftChild, left, right, value);
        } else if (left >= mid) {
            segmentTreeInsert(root.rightChild, left, right, value);
        } else {
            segmentTreeInsert(root.leftChild, left, mid, value);
            segmentTreeInsert(root.rightChild, mid, right, value);
        }
    }
    return eventRiverLayout;
});define('echarts/component/axis', [
    'require',
    './base',
    'zrender/shape/Line',
    '../config',
    '../util/ecData',
    'zrender/tool/util',
    'zrender/tool/color',
    './categoryAxis',
    './valueAxis',
    '../component'
], function (require) {
    var Base = require('./base');
    var LineShape = require('zrender/shape/Line');
    var ecConfig = require('../config');
    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrColor = require('zrender/tool/color');
    function Axis(ecTheme, messageCenter, zr, option, myChart, axisType) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.axisType = axisType;
        this._axisList = [];
        this.refresh(option);
    }
    Axis.prototype = {
        type: ecConfig.COMPONENT_TYPE_AXIS,
        axisBase: {
            _buildAxisLine: function () {
                var lineWidth = this.option.axisLine.lineStyle.width;
                var halfLineWidth = lineWidth / 2;
                var axShape = {
                    _axisShape: 'axisLine',
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase() + 3,
                    hoverable: false
                };
                var grid = this.grid;
                switch (this.option.position) {
                case 'left':
                    axShape.style = {
                        xStart: grid.getX() - halfLineWidth,
                        yStart: grid.getYend(),
                        xEnd: grid.getX() - halfLineWidth,
                        yEnd: grid.getY(),
                        lineCap: 'round'
                    };
                    break;
                case 'right':
                    axShape.style = {
                        xStart: grid.getXend() + halfLineWidth,
                        yStart: grid.getYend(),
                        xEnd: grid.getXend() + halfLineWidth,
                        yEnd: grid.getY(),
                        lineCap: 'round'
                    };
                    break;
                case 'bottom':
                    axShape.style = {
                        xStart: grid.getX(),
                        yStart: grid.getYend() + halfLineWidth,
                        xEnd: grid.getXend(),
                        yEnd: grid.getYend() + halfLineWidth,
                        lineCap: 'round'
                    };
                    break;
                case 'top':
                    axShape.style = {
                        xStart: grid.getX(),
                        yStart: grid.getY() - halfLineWidth,
                        xEnd: grid.getXend(),
                        yEnd: grid.getY() - halfLineWidth,
                        lineCap: 'round'
                    };
                    break;
                }
                var style = axShape.style;
                if (this.option.name !== '') {
                    style.text = this.option.name;
                    style.textPosition = this.option.nameLocation;
                    style.textFont = this.getFont(this.option.nameTextStyle);
                    if (this.option.nameTextStyle.align) {
                        style.textAlign = this.option.nameTextStyle.align;
                    }
                    if (this.option.nameTextStyle.baseline) {
                        style.textBaseline = this.option.nameTextStyle.baseline;
                    }
                    if (this.option.nameTextStyle.color) {
                        style.textColor = this.option.nameTextStyle.color;
                    }
                }
                style.strokeColor = this.option.axisLine.lineStyle.color;
                style.lineWidth = lineWidth;
                if (this.isHorizontal()) {
                    style.yStart = style.yEnd = this.subPixelOptimize(style.yEnd, lineWidth);
                } else {
                    style.xStart = style.xEnd = this.subPixelOptimize(style.xEnd, lineWidth);
                }
                style.lineType = this.option.axisLine.lineStyle.type;
                axShape = new LineShape(axShape);
                this.shapeList.push(axShape);
            },
            _axisLabelClickable: function (clickable, axShape) {
                if (clickable) {
                    ecData.pack(axShape, undefined, -1, undefined, -1, axShape.style.text);
                    axShape.hoverable = true;
                    axShape.clickable = true;
                    axShape.highlightStyle = {
                        color: zrColor.lift(axShape.style.color, 1),
                        brushType: 'fill'
                    };
                    return axShape;
                } else {
                    return axShape;
                }
            },
            refixAxisShape: function (zeroX, zeroY) {
                if (!this.option.axisLine.onZero) {
                    return;
                }
                var tickLength;
                if (this.isHorizontal() && zeroY != null) {
                    for (var i = 0, l = this.shapeList.length; i < l; i++) {
                        if (this.shapeList[i]._axisShape === 'axisLine') {
                            this.shapeList[i].style.yStart = this.shapeList[i].style.yEnd = this.subPixelOptimize(zeroY, this.shapeList[i].stylelineWidth);
                            this.zr.modShape(this.shapeList[i].id);
                        } else if (this.shapeList[i]._axisShape === 'axisTick') {
                            tickLength = this.shapeList[i].style.yEnd - this.shapeList[i].style.yStart;
                            this.shapeList[i].style.yStart = zeroY - tickLength;
                            this.shapeList[i].style.yEnd = zeroY;
                            this.zr.modShape(this.shapeList[i].id);
                        }
                    }
                }
                if (!this.isHorizontal() && zeroX != null) {
                    for (var i = 0, l = this.shapeList.length; i < l; i++) {
                        if (this.shapeList[i]._axisShape === 'axisLine') {
                            this.shapeList[i].style.xStart = this.shapeList[i].style.xEnd = this.subPixelOptimize(zeroX, this.shapeList[i].stylelineWidth);
                            this.zr.modShape(this.shapeList[i].id);
                        } else if (this.shapeList[i]._axisShape === 'axisTick') {
                            tickLength = this.shapeList[i].style.xEnd - this.shapeList[i].style.xStart;
                            this.shapeList[i].style.xStart = zeroX;
                            this.shapeList[i].style.xEnd = zeroX + tickLength;
                            this.zr.modShape(this.shapeList[i].id);
                        }
                    }
                }
            },
            getPosition: function () {
                return this.option.position;
            },
            isHorizontal: function () {
                return this.option.position === 'bottom' || this.option.position === 'top';
            }
        },
        reformOption: function (opt) {
            if (!opt || opt instanceof Array && opt.length === 0) {
                opt = [{ type: ecConfig.COMPONENT_TYPE_AXIS_VALUE }];
            } else if (!(opt instanceof Array)) {
                opt = [opt];
            }
            if (opt.length > 2) {
                opt = [
                    opt[0],
                    opt[1]
                ];
            }
            if (this.axisType === 'xAxis') {
                if (!opt[0].position || opt[0].position != 'bottom' && opt[0].position != 'top') {
                    opt[0].position = 'bottom';
                }
                if (opt.length > 1) {
                    opt[1].position = opt[0].position === 'bottom' ? 'top' : 'bottom';
                }
                for (var i = 0, l = opt.length; i < l; i++) {
                    opt[i].type = opt[i].type || 'category';
                    opt[i].xAxisIndex = i;
                    opt[i].yAxisIndex = -1;
                }
            } else {
                if (!opt[0].position || opt[0].position != 'left' && opt[0].position != 'right') {
                    opt[0].position = 'left';
                }
                if (opt.length > 1) {
                    opt[1].position = opt[0].position === 'left' ? 'right' : 'left';
                }
                for (var i = 0, l = opt.length; i < l; i++) {
                    opt[i].type = opt[i].type || 'value';
                    opt[i].xAxisIndex = -1;
                    opt[i].yAxisIndex = i;
                }
            }
            return opt;
        },
        refresh: function (newOption) {
            var axisOption;
            if (newOption) {
                this.option = newOption;
                if (this.axisType === 'xAxis') {
                    this.option.xAxis = this.reformOption(newOption.xAxis);
                    axisOption = this.option.xAxis;
                } else {
                    this.option.yAxis = this.reformOption(newOption.yAxis);
                    axisOption = this.option.yAxis;
                }
                this.series = newOption.series;
            }
            var CategoryAxis = require('./categoryAxis');
            var ValueAxis = require('./valueAxis');
            var len = Math.max(axisOption && axisOption.length || 0, this._axisList.length);
            for (var i = 0; i < len; i++) {
                if (this._axisList[i] && newOption && (!axisOption[i] || this._axisList[i].type != axisOption[i].type)) {
                    this._axisList[i].dispose && this._axisList[i].dispose();
                    this._axisList[i] = false;
                }
                if (this._axisList[i]) {
                    this._axisList[i].refresh && this._axisList[i].refresh(axisOption ? axisOption[i] : false, this.series);
                } else if (axisOption && axisOption[i]) {
                    this._axisList[i] = axisOption[i].type === 'category' ? new CategoryAxis(this.ecTheme, this.messageCenter, this.zr, axisOption[i], this.myChart, this.axisBase) : new ValueAxis(this.ecTheme, this.messageCenter, this.zr, axisOption[i], this.myChart, this.axisBase, this.series);
                }
            }
        },
        getAxis: function (idx) {
            return this._axisList[idx];
        },
        clear: function () {
            for (var i = 0, l = this._axisList.length; i < l; i++) {
                this._axisList[i].dispose && this._axisList[i].dispose();
            }
            this._axisList = [];
        }
    };
    zrUtil.inherits(Axis, Base);
    require('../component').define('axis', Axis);
    return Axis;
});define('echarts/component/grid', [
    'require',
    './base',
    'zrender/shape/Rectangle',
    '../config',
    'zrender/tool/util',
    '../component'
], function (require) {
    var Base = require('./base');
    var RectangleShape = require('zrender/shape/Rectangle');
    var ecConfig = require('../config');
    ecConfig.grid = {
        zlevel: 0,
        z: 0,
        x: 12,
        y: 60,
        x2: 12,
        y2: 60,
        backgroundColor: 'rgba(0,0,0,0)',
        borderWidth: 0,
        borderColor: '#ccc'
    };
    var zrUtil = require('zrender/tool/util');
    function Grid(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.refresh(option);
    }
    Grid.prototype = {
        type: ecConfig.COMPONENT_TYPE_GRID,
        getX: function () {
            return this._x;
        },
        getY: function () {
            return this._y;
        },
        getWidth: function () {
            return this._width;
        },
        getHeight: function () {
            return this._height;
        },
        getXend: function () {
            return this._x + this._width;
        },
        getYend: function () {
            return this._y + this._height;
        },
        getArea: function () {
            return {
                x: this._x,
                y: this._y,
                width: this._width,
                height: this._height
            };
        },
        getBbox: function () {
            return [
                [
                    this._x,
                    this._y
                ],
                [
                    this.getXend(),
                    this.getYend()
                ]
            ];
        },
        refixAxisShape: function (component) {
            var zeroX;
            var zeroY;
            var axisList = component.xAxis._axisList.concat(component.yAxis ? component.yAxis._axisList : []);
            var len = axisList.length;
            var axis;
            while (len--) {
                axis = axisList[len];
                if (axis.type == ecConfig.COMPONENT_TYPE_AXIS_VALUE && axis._min < 0 && axis._max >= 0) {
                    axis.isHorizontal() ? zeroX = axis.getCoord(0) : zeroY = axis.getCoord(0);
                }
            }
            if (typeof zeroX != 'undefined' || typeof zeroY != 'undefined') {
                len = axisList.length;
                while (len--) {
                    axisList[len].refixAxisShape(zeroX, zeroY);
                }
            }
        },
        refresh: function (newOption) {
            if (newOption || this._zrWidth != this.zr.getWidth() || this._zrHeight != this.zr.getHeight()) {
                this.clear();
                this.option = newOption || this.option;
                this.option.grid = this.reformOption(this.option.grid);
                var gridOption = this.option.grid;
                this._zrWidth = this.zr.getWidth();
                this._zrHeight = this.zr.getHeight();
                this._x = this.parsePercent(gridOption.x, this._zrWidth);
                this._y = this.parsePercent(gridOption.y, this._zrHeight);
                var x2 = this.parsePercent(gridOption.x2, this._zrWidth);
                var y2 = this.parsePercent(gridOption.y2, this._zrHeight);
                if (typeof gridOption.width == 'undefined') {
                    this._width = this._zrWidth - this._x - x2;
                } else {
                    this._width = this.parsePercent(gridOption.width, this._zrWidth);
                }
                this._width = this._width <= 0 ? 10 : this._width;
                if (typeof gridOption.height == 'undefined') {
                    this._height = this._zrHeight - this._y - y2;
                } else {
                    this._height = this.parsePercent(gridOption.height, this._zrHeight);
                }
                this._height = this._height <= 0 ? 10 : this._height;
                this._x = this.subPixelOptimize(this._x, gridOption.borderWidth);
                this._y = this.subPixelOptimize(this._y, gridOption.borderWidth);
                this.shapeList.push(new RectangleShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: this._x,
                        y: this._y,
                        width: this._width,
                        height: this._height,
                        brushType: gridOption.borderWidth > 0 ? 'both' : 'fill',
                        color: gridOption.backgroundColor,
                        strokeColor: gridOption.borderColor,
                        lineWidth: gridOption.borderWidth
                    }
                }));
                this.zr.addShape(this.shapeList[0]);
            }
        }
    };
    zrUtil.inherits(Grid, Base);
    require('../component').define('grid', Grid);
    return Grid;
});define('echarts/component/dataZoom', [
    'require',
    './base',
    'zrender/shape/Rectangle',
    'zrender/shape/Polygon',
    '../util/shape/Icon',
    '../config',
    '../util/date',
    'zrender/tool/util',
    '../component'
], function (require) {
    var Base = require('./base');
    var RectangleShape = require('zrender/shape/Rectangle');
    var PolygonShape = require('zrender/shape/Polygon');
    var IconShape = require('../util/shape/Icon');
    var ecConfig = require('../config');
    ecConfig.dataZoom = {
        zlevel: 0,
        z: 4,
        show: false,
        orient: 'horizontal',
        backgroundColor: 'rgba(0,0,0,0)',
        dataBackgroundColor: '#eee',
        fillerColor: 'rgba(144,197,237,0.2)',
        handleColor: 'rgba(70,130,180,0.8)',
        handleSize: 20,
        showDetail: true,
        realtime: false
    };
    var ecDate = require('../util/date');
    var zrUtil = require('zrender/tool/util');
    function DataZoom(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._ondrift = function (dx, dy) {
            return self.__ondrift(this, dx, dy);
        };
        self._ondragend = function () {
            return self.__ondragend();
        };
        this._fillerSize = 30;
        this._isSilence = false;
        this._zoom = {};
        this.option.dataZoom = this.reformOption(this.option.dataZoom);
        this.zoomOption = this.option.dataZoom;
        this._handleSize = this.zoomOption.handleSize;
        this._location = this._getLocation();
        this._zoom = this._getZoom();
        this._backupData();
        if (this.option.dataZoom.show) {
            this._buildShape();
        }
        this._syncData();
    }
    DataZoom.prototype = {
        type: ecConfig.COMPONENT_TYPE_DATAZOOM,
        _buildShape: function () {
            this._buildBackground();
            this._buildFiller();
            this._buildHandle();
            this._buildFrame();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
            this._syncFrameShape();
        },
        _getLocation: function () {
            var x;
            var y;
            var width;
            var height;
            var grid = this.component.grid;
            if (this.zoomOption.orient == 'horizontal') {
                width = this.zoomOption.width || grid.getWidth();
                height = this.zoomOption.height || this._fillerSize;
                x = this.zoomOption.x != null ? this.zoomOption.x : grid.getX();
                y = this.zoomOption.y != null ? this.zoomOption.y : this.zr.getHeight() - height - 2;
            } else {
                width = this.zoomOption.width || this._fillerSize;
                height = this.zoomOption.height || grid.getHeight();
                x = this.zoomOption.x != null ? this.zoomOption.x : 2;
                y = this.zoomOption.y != null ? this.zoomOption.y : grid.getY();
            }
            return {
                x: x,
                y: y,
                width: width,
                height: height
            };
        },
        _getZoom: function () {
            var series = this.option.series;
            var xAxis = this.option.xAxis;
            if (xAxis && !(xAxis instanceof Array)) {
                xAxis = [xAxis];
                this.option.xAxis = xAxis;
            }
            var yAxis = this.option.yAxis;
            if (yAxis && !(yAxis instanceof Array)) {
                yAxis = [yAxis];
                this.option.yAxis = yAxis;
            }
            var zoomSeriesIndex = [];
            var xAxisIndex;
            var yAxisIndex;
            var zOptIdx = this.zoomOption.xAxisIndex;
            if (xAxis && zOptIdx == null) {
                xAxisIndex = [];
                for (var i = 0, l = xAxis.length; i < l; i++) {
                    if (xAxis[i].type == 'category' || xAxis[i].type == null) {
                        xAxisIndex.push(i);
                    }
                }
            } else {
                if (zOptIdx instanceof Array) {
                    xAxisIndex = zOptIdx;
                } else if (zOptIdx != null) {
                    xAxisIndex = [zOptIdx];
                } else {
                    xAxisIndex = [];
                }
            }
            zOptIdx = this.zoomOption.yAxisIndex;
            if (yAxis && zOptIdx == null) {
                yAxisIndex = [];
                for (var i = 0, l = yAxis.length; i < l; i++) {
                    if (yAxis[i].type == 'category') {
                        yAxisIndex.push(i);
                    }
                }
            } else {
                if (zOptIdx instanceof Array) {
                    yAxisIndex = zOptIdx;
                } else if (zOptIdx != null) {
                    yAxisIndex = [zOptIdx];
                } else {
                    yAxisIndex = [];
                }
            }
            var serie;
            for (var i = 0, l = series.length; i < l; i++) {
                serie = series[i];
                if (serie.type != ecConfig.CHART_TYPE_LINE && serie.type != ecConfig.CHART_TYPE_BAR && serie.type != ecConfig.CHART_TYPE_SCATTER && serie.type != ecConfig.CHART_TYPE_K) {
                    continue;
                }
                for (var j = 0, k = xAxisIndex.length; j < k; j++) {
                    if (xAxisIndex[j] == (serie.xAxisIndex || 0)) {
                        zoomSeriesIndex.push(i);
                        break;
                    }
                }
                for (var j = 0, k = yAxisIndex.length; j < k; j++) {
                    if (yAxisIndex[j] == (serie.yAxisIndex || 0)) {
                        zoomSeriesIndex.push(i);
                        break;
                    }
                }
                if (this.zoomOption.xAxisIndex == null && this.zoomOption.yAxisIndex == null && serie.data && this.getDataFromOption(serie.data[0]) instanceof Array && (serie.type == ecConfig.CHART_TYPE_SCATTER || serie.type == ecConfig.CHART_TYPE_LINE || serie.type == ecConfig.CHART_TYPE_BAR)) {
                    zoomSeriesIndex.push(i);
                }
            }
            var start = this._zoom.start != null ? this._zoom.start : this.zoomOption.start != null ? this.zoomOption.start : 0;
            var end = this._zoom.end != null ? this._zoom.end : this.zoomOption.end != null ? this.zoomOption.end : 100;
            if (start > end) {
                start = start + end;
                end = start - end;
                start = start - end;
            }
            var size = Math.round((end - start) / 100 * (this.zoomOption.orient == 'horizontal' ? this._location.width : this._location.height));
            return {
                start: start,
                end: end,
                start2: 0,
                end2: 100,
                size: size,
                xAxisIndex: xAxisIndex,
                yAxisIndex: yAxisIndex,
                seriesIndex: zoomSeriesIndex,
                scatterMap: this._zoom.scatterMap || {}
            };
        },
        _backupData: function () {
            this._originalData = {
                xAxis: {},
                yAxis: {},
                series: {}
            };
            var xAxis = this.option.xAxis;
            var xAxisIndex = this._zoom.xAxisIndex;
            for (var i = 0, l = xAxisIndex.length; i < l; i++) {
                this._originalData.xAxis[xAxisIndex[i]] = xAxis[xAxisIndex[i]].data;
            }
            var yAxis = this.option.yAxis;
            var yAxisIndex = this._zoom.yAxisIndex;
            for (var i = 0, l = yAxisIndex.length; i < l; i++) {
                this._originalData.yAxis[yAxisIndex[i]] = yAxis[yAxisIndex[i]].data;
            }
            var series = this.option.series;
            var seriesIndex = this._zoom.seriesIndex;
            var serie;
            for (var i = 0, l = seriesIndex.length; i < l; i++) {
                serie = series[seriesIndex[i]];
                this._originalData.series[seriesIndex[i]] = serie.data;
                if (serie.data && this.getDataFromOption(serie.data[0]) instanceof Array && (serie.type == ecConfig.CHART_TYPE_SCATTER || serie.type == ecConfig.CHART_TYPE_LINE || serie.type == ecConfig.CHART_TYPE_BAR)) {
                    this._backupScale();
                    this._calculScatterMap(seriesIndex[i]);
                }
            }
        },
        _calculScatterMap: function (seriesIndex) {
            this._zoom.scatterMap = this._zoom.scatterMap || {};
            this._zoom.scatterMap[seriesIndex] = this._zoom.scatterMap[seriesIndex] || {};
            var componentLibrary = require('../component');
            var Axis = componentLibrary.get('axis');
            var axisOption = zrUtil.clone(this.option.xAxis);
            if (axisOption[0].type == 'category') {
                axisOption[0].type = 'value';
            }
            if (axisOption[1] && axisOption[1].type == 'category') {
                axisOption[1].type = 'value';
            }
            var vAxis = new Axis(this.ecTheme, null, false, {
                xAxis: axisOption,
                series: this.option.series
            }, this, 'xAxis');
            var axisIndex = this.option.series[seriesIndex].xAxisIndex || 0;
            this._zoom.scatterMap[seriesIndex].x = vAxis.getAxis(axisIndex).getExtremum();
            vAxis.dispose();
            axisOption = zrUtil.clone(this.option.yAxis);
            if (axisOption[0].type == 'category') {
                axisOption[0].type = 'value';
            }
            if (axisOption[1] && axisOption[1].type == 'category') {
                axisOption[1].type = 'value';
            }
            vAxis = new Axis(this.ecTheme, null, false, {
                yAxis: axisOption,
                series: this.option.series
            }, this, 'yAxis');
            axisIndex = this.option.series[seriesIndex].yAxisIndex || 0;
            this._zoom.scatterMap[seriesIndex].y = vAxis.getAxis(axisIndex).getExtremum();
            vAxis.dispose();
        },
        _buildBackground: function () {
            var width = this._location.width;
            var height = this._location.height;
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._location.x,
                    y: this._location.y,
                    width: width,
                    height: height,
                    color: this.zoomOption.backgroundColor
                }
            }));
            var maxLength = 0;
            var xAxis = this._originalData.xAxis;
            var xAxisIndex = this._zoom.xAxisIndex;
            for (var i = 0, l = xAxisIndex.length; i < l; i++) {
                maxLength = Math.max(maxLength, xAxis[xAxisIndex[i]].length);
            }
            var yAxis = this._originalData.yAxis;
            var yAxisIndex = this._zoom.yAxisIndex;
            for (var i = 0, l = yAxisIndex.length; i < l; i++) {
                maxLength = Math.max(maxLength, yAxis[yAxisIndex[i]].length);
            }
            var seriesIndex = this._zoom.seriesIndex[0];
            var data = this._originalData.series[seriesIndex];
            var maxValue = Number.MIN_VALUE;
            var minValue = Number.MAX_VALUE;
            var value;
            for (var i = 0, l = data.length; i < l; i++) {
                value = this.getDataFromOption(data[i], 0);
                if (this.option.series[seriesIndex].type == ecConfig.CHART_TYPE_K) {
                    value = value[1];
                }
                if (isNaN(value)) {
                    value = 0;
                }
                maxValue = Math.max(maxValue, value);
                minValue = Math.min(minValue, value);
            }
            var valueRange = maxValue - minValue;
            var pointList = [];
            var x = width / (maxLength - (maxLength > 1 ? 1 : 0));
            var y = height / (maxLength - (maxLength > 1 ? 1 : 0));
            var step = 1;
            if (this.zoomOption.orient == 'horizontal' && x < 1) {
                step = Math.floor(maxLength * 3 / width);
            } else if (this.zoomOption.orient == 'vertical' && y < 1) {
                step = Math.floor(maxLength * 3 / height);
            }
            for (var i = 0, l = maxLength; i < l; i += step) {
                value = this.getDataFromOption(data[i], 0);
                if (this.option.series[seriesIndex].type == ecConfig.CHART_TYPE_K) {
                    value = value[1];
                }
                if (isNaN(value)) {
                    value = 0;
                }
                if (this.zoomOption.orient == 'horizontal') {
                    pointList.push([
                        this._location.x + x * i,
                        this._location.y + height - 1 - Math.round((value - minValue) / valueRange * (height - 10))
                    ]);
                } else {
                    pointList.push([
                        this._location.x + 1 + Math.round((value - minValue) / valueRange * (width - 10)),
                        this._location.y + y * (l - i - 1)
                    ]);
                }
            }
            if (this.zoomOption.orient == 'horizontal') {
                pointList.push([
                    this._location.x + width,
                    this._location.y + height
                ]);
                pointList.push([
                    this._location.x,
                    this._location.y + height
                ]);
            } else {
                pointList.push([
                    this._location.x,
                    this._location.y
                ]);
                pointList.push([
                    this._location.x,
                    this._location.y + height
                ]);
            }
            this.shapeList.push(new PolygonShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    pointList: pointList,
                    color: this.zoomOption.dataBackgroundColor
                },
                hoverable: false
            }));
        },
        _buildFiller: function () {
            this._fillerShae = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                draggable: true,
                ondrift: this._ondrift,
                ondragend: this._ondragend,
                _type: 'filler'
            };
            if (this.zoomOption.orient == 'horizontal') {
                this._fillerShae.style = {
                    x: this._location.x + Math.round(this._zoom.start / 100 * this._location.width) + this._handleSize,
                    y: this._location.y,
                    width: this._zoom.size - this._handleSize * 2,
                    height: this._location.height,
                    color: this.zoomOption.fillerColor,
                    text: ':::',
                    textPosition: 'inside'
                };
            } else {
                this._fillerShae.style = {
                    x: this._location.x,
                    y: this._location.y + Math.round(this._zoom.start / 100 * this._location.height) + this._handleSize,
                    width: this._location.width,
                    height: this._zoom.size - this._handleSize * 2,
                    color: this.zoomOption.fillerColor,
                    text: '::',
                    textPosition: 'inside'
                };
            }
            this._fillerShae.highlightStyle = {
                brushType: 'fill',
                color: 'rgba(0,0,0,0)'
            };
            this._fillerShae = new RectangleShape(this._fillerShae);
            this.shapeList.push(this._fillerShae);
        },
        _buildHandle: function () {
            var detail = this.zoomOption.showDetail ? this._getDetail() : {
                start: '',
                end: ''
            };
            this._startShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                draggable: true,
                style: {
                    iconType: 'rectangle',
                    x: this._location.x,
                    y: this._location.y,
                    width: this._handleSize,
                    height: this._handleSize,
                    color: this.zoomOption.handleColor,
                    text: '=',
                    textPosition: 'inside'
                },
                highlightStyle: {
                    text: detail.start,
                    brushType: 'fill',
                    textPosition: 'left'
                },
                ondrift: this._ondrift,
                ondragend: this._ondragend
            };
            if (this.zoomOption.orient == 'horizontal') {
                this._startShape.style.height = this._location.height;
                this._endShape = zrUtil.clone(this._startShape);
                this._startShape.style.x = this._fillerShae.style.x - this._handleSize, this._endShape.style.x = this._fillerShae.style.x + this._fillerShae.style.width;
                this._endShape.highlightStyle.text = detail.end;
                this._endShape.highlightStyle.textPosition = 'right';
            } else {
                this._startShape.style.width = this._location.width;
                this._endShape = zrUtil.clone(this._startShape);
                this._startShape.style.y = this._fillerShae.style.y + this._fillerShae.style.height;
                this._startShape.highlightStyle.textPosition = 'bottom';
                this._endShape.style.y = this._fillerShae.style.y - this._handleSize;
                this._endShape.highlightStyle.text = detail.end;
                this._endShape.highlightStyle.textPosition = 'top';
            }
            this._startShape = new IconShape(this._startShape);
            this._endShape = new IconShape(this._endShape);
            this.shapeList.push(this._startShape);
            this.shapeList.push(this._endShape);
        },
        _buildFrame: function () {
            var x = this.subPixelOptimize(this._location.x, 1);
            var y = this.subPixelOptimize(this._location.y, 1);
            this._startFrameShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: x,
                    y: y,
                    width: this._location.width - (x > this._location.x ? 1 : 0),
                    height: this._location.height - (y > this._location.y ? 1 : 0),
                    lineWidth: 1,
                    brushType: 'stroke',
                    strokeColor: this.zoomOption.handleColor
                }
            };
            this._endFrameShape = zrUtil.clone(this._startFrameShape);
            this._startFrameShape = new RectangleShape(this._startFrameShape);
            this._endFrameShape = new RectangleShape(this._endFrameShape);
            this.shapeList.push(this._startFrameShape);
            this.shapeList.push(this._endFrameShape);
            return;
        },
        _syncHandleShape: function () {
            if (this.zoomOption.orient == 'horizontal') {
                this._startShape.style.x = this._fillerShae.style.x - this._handleSize;
                this._endShape.style.x = this._fillerShae.style.x + this._fillerShae.style.width;
                this._zoom.start = (this._startShape.style.x - this._location.x) / this._location.width * 100;
                this._zoom.end = (this._endShape.style.x + this._handleSize - this._location.x) / this._location.width * 100;
            } else {
                this._startShape.style.y = this._fillerShae.style.y + this._fillerShae.style.height;
                this._endShape.style.y = this._fillerShae.style.y - this._handleSize;
                this._zoom.start = (this._location.y + this._location.height - this._startShape.style.y) / this._location.height * 100;
                this._zoom.end = (this._location.y + this._location.height - this._endShape.style.y - this._handleSize) / this._location.height * 100;
            }
            this.zr.modShape(this._startShape.id);
            this.zr.modShape(this._endShape.id);
            this._syncFrameShape();
            this.zr.refreshNextFrame();
        },
        _syncFillerShape: function () {
            var a;
            var b;
            if (this.zoomOption.orient == 'horizontal') {
                a = this._startShape.style.x;
                b = this._endShape.style.x;
                this._fillerShae.style.x = Math.min(a, b) + this._handleSize;
                this._fillerShae.style.width = Math.abs(a - b) - this._handleSize;
                this._zoom.start = (Math.min(a, b) - this._location.x) / this._location.width * 100;
                this._zoom.end = (Math.max(a, b) + this._handleSize - this._location.x) / this._location.width * 100;
            } else {
                a = this._startShape.style.y;
                b = this._endShape.style.y;
                this._fillerShae.style.y = Math.min(a, b) + this._handleSize;
                this._fillerShae.style.height = Math.abs(a - b) - this._handleSize;
                this._zoom.start = (this._location.y + this._location.height - Math.max(a, b)) / this._location.height * 100;
                this._zoom.end = (this._location.y + this._location.height - Math.min(a, b) - this._handleSize) / this._location.height * 100;
            }
            this.zr.modShape(this._fillerShae.id);
            this._syncFrameShape();
            this.zr.refreshNextFrame();
        },
        _syncFrameShape: function () {
            if (this.zoomOption.orient == 'horizontal') {
                this._startFrameShape.style.width = this._fillerShae.style.x - this._location.x;
                this._endFrameShape.style.x = this._fillerShae.style.x + this._fillerShae.style.width;
                this._endFrameShape.style.width = this._location.x + this._location.width - this._endFrameShape.style.x;
            } else {
                this._startFrameShape.style.y = this._fillerShae.style.y + this._fillerShae.style.height;
                this._startFrameShape.style.height = this._location.y + this._location.height - this._startFrameShape.style.y;
                this._endFrameShape.style.height = this._fillerShae.style.y - this._location.y;
            }
            this.zr.modShape(this._startFrameShape.id);
            this.zr.modShape(this._endFrameShape.id);
        },
        _syncShape: function () {
            if (!this.zoomOption.show) {
                return;
            }
            if (this.zoomOption.orient == 'horizontal') {
                this._startShape.style.x = this._location.x + this._zoom.start / 100 * this._location.width;
                this._endShape.style.x = this._location.x + this._zoom.end / 100 * this._location.width - this._handleSize;
                this._fillerShae.style.x = this._startShape.style.x + this._handleSize;
                this._fillerShae.style.width = this._endShape.style.x - this._startShape.style.x - this._handleSize;
            } else {
                this._startShape.style.y = this._location.y + this._location.height - this._zoom.start / 100 * this._location.height;
                this._endShape.style.y = this._location.y + this._location.height - this._zoom.end / 100 * this._location.height - this._handleSize;
                this._fillerShae.style.y = this._endShape.style.y + this._handleSize;
                this._fillerShae.style.height = this._startShape.style.y - this._endShape.style.y - this._handleSize;
            }
            this.zr.modShape(this._startShape.id);
            this.zr.modShape(this._endShape.id);
            this.zr.modShape(this._fillerShae.id);
            this._syncFrameShape();
            this.zr.refresh();
        },
        _syncData: function (dispatchNow) {
            var target;
            var start;
            var end;
            var length;
            var data;
            for (var key in this._originalData) {
                target = this._originalData[key];
                for (var idx in target) {
                    data = target[idx];
                    if (data == null) {
                        continue;
                    }
                    length = data.length;
                    start = Math.floor(this._zoom.start / 100 * length);
                    end = Math.ceil(this._zoom.end / 100 * length);
                    if (!(this.getDataFromOption(data[0]) instanceof Array) || this.option[key][idx].type == ecConfig.CHART_TYPE_K) {
                        this.option[key][idx].data = data.slice(start, end);
                    } else {
                        this._setScale();
                        this.option[key][idx].data = this._synScatterData(idx, data);
                    }
                }
            }
            if (!this._isSilence && (this.zoomOption.realtime || dispatchNow)) {
                this.messageCenter.dispatch(ecConfig.EVENT.DATA_ZOOM, null, { zoom: this._zoom }, this.myChart);
            }
        },
        _synScatterData: function (seriesIndex, data) {
            if (this._zoom.start === 0 && this._zoom.end == 100 && this._zoom.start2 === 0 && this._zoom.end2 == 100) {
                return data;
            }
            var newData = [];
            var scale = this._zoom.scatterMap[seriesIndex];
            var total;
            var xStart;
            var xEnd;
            var yStart;
            var yEnd;
            if (this.zoomOption.orient == 'horizontal') {
                total = scale.x.max - scale.x.min;
                xStart = this._zoom.start / 100 * total + scale.x.min;
                xEnd = this._zoom.end / 100 * total + scale.x.min;
                total = scale.y.max - scale.y.min;
                yStart = this._zoom.start2 / 100 * total + scale.y.min;
                yEnd = this._zoom.end2 / 100 * total + scale.y.min;
            } else {
                total = scale.x.max - scale.x.min;
                xStart = this._zoom.start2 / 100 * total + scale.x.min;
                xEnd = this._zoom.end2 / 100 * total + scale.x.min;
                total = scale.y.max - scale.y.min;
                yStart = this._zoom.start / 100 * total + scale.y.min;
                yEnd = this._zoom.end / 100 * total + scale.y.min;
            }
            var value;
            for (var i = 0, l = data.length; i < l; i++) {
                value = data[i].value || data[i];
                if (value[0] >= xStart && value[0] <= xEnd && value[1] >= yStart && value[1] <= yEnd) {
                    newData.push(data[i]);
                }
            }
            return newData;
        },
        _setScale: function () {
            var needScale = this._zoom.start !== 0 || this._zoom.end !== 100 || this._zoom.start2 !== 0 || this._zoom.end2 !== 100;
            var axis = {
                xAxis: this.option.xAxis,
                yAxis: this.option.yAxis
            };
            for (var key in axis) {
                for (var i = 0, l = axis[key].length; i < l; i++) {
                    axis[key][i].scale = needScale || axis[key][i]._scale;
                }
            }
        },
        _backupScale: function () {
            var axis = {
                xAxis: this.option.xAxis,
                yAxis: this.option.yAxis
            };
            for (var key in axis) {
                for (var i = 0, l = axis[key].length; i < l; i++) {
                    axis[key][i]._scale = axis[key][i].scale;
                }
            }
        },
        _getDetail: function () {
            var key = this.zoomOption.orient == 'horizontal' ? 'xAxis' : 'yAxis';
            var target = this._originalData[key];
            for (var idx in target) {
                var data = target[idx];
                if (data == null) {
                    continue;
                }
                var length = data.length;
                var start = Math.floor(this._zoom.start / 100 * length);
                var end = Math.ceil(this._zoom.end / 100 * length);
                end -= end > 0 ? 1 : 0;
                return {
                    start: this.getDataFromOption(data[start]),
                    end: this.getDataFromOption(data[end])
                };
            }
            var seriesIndex = this._zoom.seriesIndex[0];
            var axisIndex = this.option.series[seriesIndex][key + 'Index'] || 0;
            var axisType = this.option[key][axisIndex].type;
            var min = this._zoom.scatterMap[seriesIndex][key.charAt(0)].min;
            var max = this._zoom.scatterMap[seriesIndex][key.charAt(0)].max;
            var gap = max - min;
            if (axisType == 'value') {
                return {
                    start: min + gap * this._zoom.start / 100,
                    end: min + gap * this._zoom.end / 100
                };
            } else if (axisType == 'time') {
                max = min + gap * this._zoom.end / 100;
                min = min + gap * this._zoom.start / 100;
                var formatter = ecDate.getAutoFormatter(min, max).formatter;
                return {
                    start: ecDate.format(formatter, min),
                    end: ecDate.format(formatter, max)
                };
            }
            return {
                start: '',
                end: ''
            };
        },
        __ondrift: function (shape, dx, dy) {
            if (this.zoomOption.zoomLock) {
                shape = this._fillerShae;
            }
            var detailSize = shape._type == 'filler' ? this._handleSize : 0;
            if (this.zoomOption.orient == 'horizontal') {
                if (shape.style.x + dx - detailSize <= this._location.x) {
                    shape.style.x = this._location.x + detailSize;
                } else if (shape.style.x + dx + shape.style.width + detailSize >= this._location.x + this._location.width) {
                    shape.style.x = this._location.x + this._location.width - shape.style.width - detailSize;
                } else {
                    shape.style.x += dx;
                }
            } else {
                if (shape.style.y + dy - detailSize <= this._location.y) {
                    shape.style.y = this._location.y + detailSize;
                } else if (shape.style.y + dy + shape.style.height + detailSize >= this._location.y + this._location.height) {
                    shape.style.y = this._location.y + this._location.height - shape.style.height - detailSize;
                } else {
                    shape.style.y += dy;
                }
            }
            if (shape._type == 'filler') {
                this._syncHandleShape();
            } else {
                this._syncFillerShape();
            }
            if (this.zoomOption.realtime) {
                this._syncData();
            }
            if (this.zoomOption.showDetail) {
                var detail = this._getDetail();
                this._startShape.style.text = this._startShape.highlightStyle.text = detail.start;
                this._endShape.style.text = this._endShape.highlightStyle.text = detail.end;
                this._startShape.style.textPosition = this._startShape.highlightStyle.textPosition;
                this._endShape.style.textPosition = this._endShape.highlightStyle.textPosition;
            }
            return true;
        },
        __ondragend: function () {
            if (this.zoomOption.showDetail) {
                this._startShape.style.text = this._endShape.style.text = '=';
                this._startShape.style.textPosition = this._endShape.style.textPosition = 'inside';
                this.zr.modShape(this._startShape.id);
                this.zr.modShape(this._endShape.id);
                this.zr.refreshNextFrame();
            }
            this.isDragend = true;
        },
        ondragend: function (param, status) {
            if (!this.isDragend || !param.target) {
                return;
            }
            !this.zoomOption.realtime && this._syncData();
            status.dragOut = true;
            status.dragIn = true;
            if (!this._isSilence && !this.zoomOption.realtime) {
                this.messageCenter.dispatch(ecConfig.EVENT.DATA_ZOOM, null, { zoom: this._zoom }, this.myChart);
            }
            status.needRefresh = false;
            this.isDragend = false;
            return;
        },
        ondataZoom: function (param, status) {
            status.needRefresh = true;
            return;
        },
        absoluteZoom: function (param) {
            this._zoom.start = param.start;
            this._zoom.end = param.end;
            this._zoom.start2 = param.start2;
            this._zoom.end2 = param.end2;
            this._syncShape();
            this._syncData(true);
            return;
        },
        rectZoom: function (param) {
            if (!param) {
                this._zoom.start = this._zoom.start2 = 0;
                this._zoom.end = this._zoom.end2 = 100;
                this._syncShape();
                this._syncData(true);
                return this._zoom;
            }
            var gridArea = this.component.grid.getArea();
            var rect = {
                x: param.x,
                y: param.y,
                width: param.width,
                height: param.height
            };
            if (rect.width < 0) {
                rect.x += rect.width;
                rect.width = -rect.width;
            }
            if (rect.height < 0) {
                rect.y += rect.height;
                rect.height = -rect.height;
            }
            if (rect.x > gridArea.x + gridArea.width || rect.y > gridArea.y + gridArea.height) {
                return false;
            }
            if (rect.x < gridArea.x) {
                rect.x = gridArea.x;
            }
            if (rect.x + rect.width > gridArea.x + gridArea.width) {
                rect.width = gridArea.x + gridArea.width - rect.x;
            }
            if (rect.y + rect.height > gridArea.y + gridArea.height) {
                rect.height = gridArea.y + gridArea.height - rect.y;
            }
            var total;
            var sdx = (rect.x - gridArea.x) / gridArea.width;
            var edx = 1 - (rect.x + rect.width - gridArea.x) / gridArea.width;
            var sdy = 1 - (rect.y + rect.height - gridArea.y) / gridArea.height;
            var edy = (rect.y - gridArea.y) / gridArea.height;
            if (this.zoomOption.orient == 'horizontal') {
                total = this._zoom.end - this._zoom.start;
                this._zoom.start += total * sdx;
                this._zoom.end -= total * edx;
                total = this._zoom.end2 - this._zoom.start2;
                this._zoom.start2 += total * sdy;
                this._zoom.end2 -= total * edy;
            } else {
                total = this._zoom.end - this._zoom.start;
                this._zoom.start += total * sdy;
                this._zoom.end -= total * edy;
                total = this._zoom.end2 - this._zoom.start2;
                this._zoom.start2 += total * sdx;
                this._zoom.end2 -= total * edx;
            }
            this._syncShape();
            this._syncData(true);
            return this._zoom;
        },
        syncBackupData: function (curOption) {
            var start;
            var target = this._originalData['series'];
            var curSeries = curOption.series;
            var curData;
            for (var i = 0, l = curSeries.length; i < l; i++) {
                curData = curSeries[i].data || curSeries[i].eventList;
                if (target[i]) {
                    start = Math.floor(this._zoom.start / 100 * target[i].length);
                } else {
                    start = 0;
                }
                for (var j = 0, k = curData.length; j < k; j++) {
                    if (target[i]) {
                        target[i][j + start] = curData[j];
                    }
                }
            }
        },
        syncOption: function (magicOption) {
            this.silence(true);
            this.option = magicOption;
            this.option.dataZoom = this.reformOption(this.option.dataZoom);
            this.zoomOption = this.option.dataZoom;
            this.clear();
            this._location = this._getLocation();
            this._zoom = this._getZoom();
            this._backupData();
            if (this.option.dataZoom && this.option.dataZoom.show) {
                this._buildShape();
            }
            this._syncData();
            this.silence(false);
        },
        silence: function (s) {
            this._isSilence = s;
        },
        getRealDataIndex: function (sIdx, dIdx) {
            if (!this._originalData || this._zoom.start === 0 && this._zoom.end == 100) {
                return dIdx;
            }
            var sreies = this._originalData.series;
            if (sreies[sIdx]) {
                return Math.floor(this._zoom.start / 100 * sreies[sIdx].length) + dIdx;
            }
            return -1;
        },
        resize: function () {
            this.clear();
            this._location = this._getLocation();
            this._zoom = this._getZoom();
            if (this.option.dataZoom.show) {
                this._buildShape();
            }
        }
    };
    zrUtil.inherits(DataZoom, Base);
    require('../component').define('dataZoom', DataZoom);
    return DataZoom;
});define('echarts/util/date', [], function () {
    var _timeGap = [
        {
            formatter: 'hh : mm : ss',
            value: 1000
        },
        {
            formatter: 'hh : mm : ss',
            value: 1000 * 5
        },
        {
            formatter: 'hh : mm : ss',
            value: 1000 * 10
        },
        {
            formatter: 'hh : mm : ss',
            value: 1000 * 15
        },
        {
            formatter: 'hh : mm : ss',
            value: 1000 * 30
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 60000
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 60000 * 5
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 60000 * 10
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 60000 * 15
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 60000 * 30
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 3600000
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 3600000 * 2
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 3600000 * 6
        },
        {
            formatter: 'hh : mm\nMM - dd',
            value: 3600000 * 12
        },
        {
            formatter: 'MM - dd\nyyyy',
            value: 3600000 * 24
        },
        {
            formatter: 'week',
            value: 3600000 * 24 * 7
        },
        {
            formatter: 'month',
            value: 3600000 * 24 * 31
        },
        {
            formatter: 'quarter',
            value: 3600000 * 24 * 380 / 4
        },
        {
            formatter: 'half-year',
            value: 3600000 * 24 * 380 / 2
        },
        {
            formatter: 'year',
            value: 3600000 * 24 * 380
        }
    ];
    function getAutoFormatter(min, max, splitNumber) {
        splitNumber = splitNumber > 1 ? splitNumber : 2;
        var curValue;
        var totalGap;
        var formatter;
        var gapValue;
        for (var i = 0, l = _timeGap.length; i < l; i++) {
            curValue = _timeGap[i].value;
            totalGap = Math.ceil(max / curValue) * curValue - Math.floor(min / curValue) * curValue;
            if (Math.round(totalGap / curValue) <= splitNumber * 1.2) {
                formatter = _timeGap[i].formatter;
                gapValue = _timeGap[i].value;
                break;
            }
        }
        if (formatter == null) {
            formatter = 'year';
            curValue = 3600000 * 24 * 367;
            totalGap = Math.ceil(max / curValue) * curValue - Math.floor(min / curValue) * curValue;
            gapValue = Math.round(totalGap / (splitNumber - 1) / curValue) * curValue;
        }
        return {
            formatter: formatter,
            gapValue: gapValue
        };
    }
    function s2d(v) {
        return v < 10 ? '0' + v : v;
    }
    function format(formatter, value) {
        if (formatter == 'week' || formatter == 'month' || formatter == 'quarter' || formatter == 'half-year' || formatter == 'year') {
            formatter = 'MM - dd\nyyyy';
        }
        var date = getNewDate(value);
        var y = date.getFullYear();
        var M = date.getMonth() + 1;
        var d = date.getDate();
        var h = date.getHours();
        var m = date.getMinutes();
        var s = date.getSeconds();
        formatter = formatter.replace('MM', s2d(M));
        formatter = formatter.toLowerCase();
        formatter = formatter.replace('yyyy', y);
        formatter = formatter.replace('yy', y % 100);
        formatter = formatter.replace('dd', s2d(d));
        formatter = formatter.replace('d', d);
        formatter = formatter.replace('hh', s2d(h));
        formatter = formatter.replace('h', h);
        formatter = formatter.replace('mm', s2d(m));
        formatter = formatter.replace('m', m);
        formatter = formatter.replace('ss', s2d(s));
        formatter = formatter.replace('s', s);
        return formatter;
    }
    function nextMonday(value) {
        value = getNewDate(value);
        value.setDate(value.getDate() + 8 - value.getDay());
        return value;
    }
    function nextNthPerNmonth(value, nth, nmon) {
        value = getNewDate(value);
        value.setMonth(Math.ceil((value.getMonth() + 1) / nmon) * nmon);
        value.setDate(nth);
        return value;
    }
    function nextNthOnMonth(value, nth) {
        return nextNthPerNmonth(value, nth, 1);
    }
    function nextNthOnQuarterYear(value, nth) {
        return nextNthPerNmonth(value, nth, 3);
    }
    function nextNthOnHalfYear(value, nth) {
        return nextNthPerNmonth(value, nth, 6);
    }
    function nextNthOnYear(value, nth) {
        return nextNthPerNmonth(value, nth, 12);
    }
    function getNewDate(value) {
        return value instanceof Date ? value : new Date(typeof value == 'string' ? value.replace(/-/g, '/') : value);
    }
    return {
        getAutoFormatter: getAutoFormatter,
        getNewDate: getNewDate,
        format: format,
        nextMonday: nextMonday,
        nextNthPerNmonth: nextNthPerNmonth,
        nextNthOnMonth: nextNthOnMonth,
        nextNthOnQuarterYear: nextNthOnQuarterYear,
        nextNthOnHalfYear: nextNthOnHalfYear,
        nextNthOnYear: nextNthOnYear
    };
});define('echarts/component/categoryAxis', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Line',
    'zrender/shape/Rectangle',
    '../config',
    'zrender/tool/util',
    'zrender/tool/area',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var LineShape = require('zrender/shape/Line');
    var RectangleShape = require('zrender/shape/Rectangle');
    var ecConfig = require('../config');
    ecConfig.categoryAxis = {
        zlevel: 0,
        z: 0,
        show: true,
        position: 'bottom',
        name: '',
        nameLocation: 'end',
        nameTextStyle: {},
        boundaryGap: true,
        axisLine: {
            show: true,
            onZero: true,
            lineStyle: {
                color: '#48b',
                width: 2,
                type: 'solid'
            }
        },
        axisTick: {
            show: true,
            interval: 'auto',
            inside: false,
            length: 5,
            lineStyle: {
                color: '#333',
                width: 1
            }
        },
        axisLabel: {
            show: true,
            interval: 'auto',
            rotate: 0,
            margin: 8,
            textStyle: { color: '#333' }
        },
        splitLine: {
            show: false,
            lineStyle: {
                color: ['#ccc'],
                width: 1,
                type: 'solid'
            }
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: [
                    'rgba(250,250,250,0.3)',
                    'rgba(200,200,200,0.3)'
                ]
            }
        }
    };
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    function CategoryAxis(ecTheme, messageCenter, zr, option, myChart, axisBase) {
        if (option.data.length < 1) {
            console.error('option.data.length < 1.');
            return;
        }
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.grid = this.component.grid;
        for (var method in axisBase) {
            this[method] = axisBase[method];
        }
        this.refresh(option);
    }
    CategoryAxis.prototype = {
        type: ecConfig.COMPONENT_TYPE_AXIS_CATEGORY,
        _getReformedLabel: function (idx) {
            var data = this.getDataFromOption(this.option.data[idx]);
            var formatter = this.option.data[idx].formatter || this.option.axisLabel.formatter;
            if (formatter) {
                if (typeof formatter == 'function') {
                    data = formatter.call(this.myChart, data);
                } else if (typeof formatter == 'string') {
                    data = formatter.replace('{value}', data);
                }
            }
            return data;
        },
        _getInterval: function () {
            var interval = this.option.axisLabel.interval;
            if (interval == 'auto') {
                var fontSize = this.option.axisLabel.textStyle.fontSize;
                var data = this.option.data;
                var dataLength = this.option.data.length;
                if (this.isHorizontal()) {
                    if (dataLength > 3) {
                        var gap = this.getGap();
                        var isEnough = false;
                        var labelSpace;
                        var labelSize;
                        var step = Math.floor(0.5 / gap);
                        step = step < 1 ? 1 : step;
                        interval = Math.floor(15 / gap);
                        while (!isEnough && interval < dataLength) {
                            interval += step;
                            isEnough = true;
                            labelSpace = Math.floor(gap * interval);
                            for (var i = Math.floor((dataLength - 1) / interval) * interval; i >= 0; i -= interval) {
                                if (this.option.axisLabel.rotate !== 0) {
                                    labelSize = fontSize;
                                } else if (data[i].textStyle) {
                                    labelSize = zrArea.getTextWidth(this._getReformedLabel(i), this.getFont(zrUtil.merge(data[i].textStyle, this.option.axisLabel.textStyle)));
                                } else {
                                    var label = this._getReformedLabel(i) + '';
                                    var wLen = (label.match(/\w/g) || '').length;
                                    var oLen = label.length - wLen;
                                    labelSize = wLen * fontSize * 2 / 3 + oLen * fontSize;
                                }
                                if (labelSpace < labelSize) {
                                    isEnough = false;
                                    break;
                                }
                            }
                        }
                    } else {
                        interval = 1;
                    }
                } else {
                    if (dataLength > 3) {
                        var gap = this.getGap();
                        interval = Math.floor(11 / gap);
                        while (gap * interval - 6 < fontSize && interval < dataLength) {
                            interval++;
                        }
                    } else {
                        interval = 1;
                    }
                }
            } else {
                interval = typeof interval == 'function' ? 1 : interval - 0 + 1;
            }
            return interval;
        },
        _buildShape: function () {
            this._interval = this._getInterval();
            if (!this.option.show) {
                return;
            }
            this.option.splitArea.show && this._buildSplitArea();
            this.option.splitLine.show && this._buildSplitLine();
            this.option.axisLine.show && this._buildAxisLine();
            this.option.axisTick.show && this._buildAxisTick();
            this.option.axisLabel.show && this._buildAxisLabel();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildAxisTick: function () {
            var axShape;
            var data = this.option.data;
            var dataLength = this.option.data.length;
            var tickOption = this.option.axisTick;
            var length = tickOption.length;
            var color = tickOption.lineStyle.color;
            var lineWidth = tickOption.lineStyle.width;
            var intervalFunction = typeof tickOption.interval == 'function' ? tickOption.interval : tickOption.interval == 'auto' ? typeof this.option.axisLabel.interval == 'function' ? this.option.axisLabel.interval : false : false;
            var interval = intervalFunction ? 1 : tickOption.interval == 'auto' ? this._interval : tickOption.interval - 0 + 1;
            var onGap = tickOption.onGap;
            var optGap = onGap ? this.getGap() / 2 : typeof onGap == 'undefined' ? this.option.boundaryGap ? this.getGap() / 2 : 0 : 0;
            var startIndex = optGap > 0 ? -interval : 0;
            if (this.isHorizontal()) {
                var yPosition = this.option.position == 'bottom' ? tickOption.inside ? this.grid.getYend() - length - 1 : this.grid.getYend() + 1 : tickOption.inside ? this.grid.getY() + 1 : this.grid.getY() - length - 1;
                var x;
                for (var i = startIndex; i < dataLength; i += interval) {
                    if (intervalFunction && !intervalFunction(i, data[i])) {
                        continue;
                    }
                    x = this.subPixelOptimize(this.getCoordByIndex(i) + (i >= 0 ? optGap : 0), lineWidth);
                    axShape = {
                        _axisShape: 'axisTick',
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: x,
                            yStart: yPosition,
                            xEnd: x,
                            yEnd: yPosition + length,
                            strokeColor: color,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            } else {
                var xPosition = this.option.position == 'left' ? tickOption.inside ? this.grid.getX() + 1 : this.grid.getX() - length - 1 : tickOption.inside ? this.grid.getXend() - length - 1 : this.grid.getXend() + 1;
                var y;
                for (var i = startIndex; i < dataLength; i += interval) {
                    if (intervalFunction && !intervalFunction(i, data[i])) {
                        continue;
                    }
                    y = this.subPixelOptimize(this.getCoordByIndex(i) - (i >= 0 ? optGap : 0), lineWidth);
                    axShape = {
                        _axisShape: 'axisTick',
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: xPosition,
                            yStart: y,
                            xEnd: xPosition + length,
                            yEnd: y,
                            strokeColor: color,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            }
        },
        _buildAxisLabel: function () {
            var axShape;
            var data = this.option.data;
            var dataLength = this.option.data.length;
            var labelOption = this.option.axisLabel;
            var rotate = labelOption.rotate;
            var margin = labelOption.margin;
            var clickable = labelOption.clickable;
            var textStyle = labelOption.textStyle;
            var intervalFunction = typeof labelOption.interval == 'function' ? labelOption.interval : false;
            var dataTextStyle;
            if (this.isHorizontal()) {
                var yPosition;
                var baseLine;
                if (this.option.position == 'bottom') {
                    yPosition = this.grid.getYend() + margin;
                    baseLine = 'top';
                } else {
                    yPosition = this.grid.getY() - margin;
                    baseLine = 'bottom';
                }
                for (var i = 0; i < dataLength; i += this._interval) {
                    if (intervalFunction && !intervalFunction(i, data[i]) || this._getReformedLabel(i) === '') {
                        continue;
                    }
                    dataTextStyle = zrUtil.merge(data[i].textStyle || {}, textStyle);
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase() + 3,
                        hoverable: false,
                        style: {
                            x: this.getCoordByIndex(i),
                            y: yPosition,
                            color: dataTextStyle.color,
                            text: this._getReformedLabel(i),
                            textFont: this.getFont(dataTextStyle),
                            textAlign: dataTextStyle.align || 'center',
                            textBaseline: dataTextStyle.baseline || baseLine
                        }
                    };
                    if (rotate) {
                        axShape.style.textAlign = rotate > 0 ? this.option.position == 'bottom' ? 'right' : 'left' : this.option.position == 'bottom' ? 'left' : 'right';
                        axShape.rotation = [
                            rotate * Math.PI / 180,
                            axShape.style.x,
                            axShape.style.y
                        ];
                    }
                    this.shapeList.push(new TextShape(this._axisLabelClickable(clickable, axShape)));
                }
            } else {
                var xPosition;
                var align;
                if (this.option.position == 'left') {
                    xPosition = this.grid.getX() - margin;
                    align = 'right';
                } else {
                    xPosition = this.grid.getXend() + margin;
                    align = 'left';
                }
                for (var i = 0; i < dataLength; i += this._interval) {
                    if (intervalFunction && !intervalFunction(i, data[i]) || this._getReformedLabel(i) === '') {
                        continue;
                    }
                    dataTextStyle = zrUtil.merge(data[i].textStyle || {}, textStyle);
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase() + 3,
                        hoverable: false,
                        style: {
                            x: xPosition,
                            y: this.getCoordByIndex(i),
                            color: dataTextStyle.color,
                            text: this._getReformedLabel(i),
                            textFont: this.getFont(dataTextStyle),
                            textAlign: dataTextStyle.align || align,
                            textBaseline: dataTextStyle.baseline || i === 0 && this.option.name !== '' ? 'bottom' : i == dataLength - 1 && this.option.name !== '' ? 'top' : 'middle'
                        }
                    };
                    if (rotate) {
                        axShape.rotation = [
                            rotate * Math.PI / 180,
                            axShape.style.x,
                            axShape.style.y
                        ];
                    }
                    this.shapeList.push(new TextShape(this._axisLabelClickable(clickable, axShape)));
                }
            }
        },
        _buildSplitLine: function () {
            var axShape;
            var data = this.option.data;
            var dataLength = this.option.data.length;
            var sLineOption = this.option.splitLine;
            var lineType = sLineOption.lineStyle.type;
            var lineWidth = sLineOption.lineStyle.width;
            var color = sLineOption.lineStyle.color;
            color = color instanceof Array ? color : [color];
            var colorLength = color.length;
            var intervalFunction = typeof this.option.axisLabel.interval == 'function' ? this.option.axisLabel.interval : false;
            var onGap = sLineOption.onGap;
            var optGap = onGap ? this.getGap() / 2 : typeof onGap == 'undefined' ? this.option.boundaryGap ? this.getGap() / 2 : 0 : 0;
            dataLength -= onGap || typeof onGap == 'undefined' && this.option.boundaryGap ? 1 : 0;
            if (this.isHorizontal()) {
                var sy = this.grid.getY();
                var ey = this.grid.getYend();
                var x;
                for (var i = 0; i < dataLength; i += this._interval) {
                    if (intervalFunction && !intervalFunction(i, data[i])) {
                        continue;
                    }
                    x = this.subPixelOptimize(this.getCoordByIndex(i) + optGap, lineWidth);
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: x,
                            yStart: sy,
                            xEnd: x,
                            yEnd: ey,
                            strokeColor: color[i / this._interval % colorLength],
                            lineType: lineType,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            } else {
                var sx = this.grid.getX();
                var ex = this.grid.getXend();
                var y;
                for (var i = 0; i < dataLength; i += this._interval) {
                    if (intervalFunction && !intervalFunction(i, data[i])) {
                        continue;
                    }
                    y = this.subPixelOptimize(this.getCoordByIndex(i) - optGap, lineWidth);
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: sx,
                            yStart: y,
                            xEnd: ex,
                            yEnd: y,
                            strokeColor: color[i / this._interval % colorLength],
                            lineType: lineType,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            }
        },
        _buildSplitArea: function () {
            var axShape;
            var data = this.option.data;
            var sAreaOption = this.option.splitArea;
            var color = sAreaOption.areaStyle.color;
            if (!(color instanceof Array)) {
                axShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: this.grid.getX(),
                        y: this.grid.getY(),
                        width: this.grid.getWidth(),
                        height: this.grid.getHeight(),
                        color: color
                    }
                };
                this.shapeList.push(new RectangleShape(axShape));
            } else {
                var colorLength = color.length;
                var dataLength = this.option.data.length;
                var intervalFunction = typeof this.option.axisLabel.interval == 'function' ? this.option.axisLabel.interval : false;
                var onGap = sAreaOption.onGap;
                var optGap = onGap ? this.getGap() / 2 : typeof onGap == 'undefined' ? this.option.boundaryGap ? this.getGap() / 2 : 0 : 0;
                if (this.isHorizontal()) {
                    var y = this.grid.getY();
                    var height = this.grid.getHeight();
                    var lastX = this.grid.getX();
                    var curX;
                    for (var i = 0; i <= dataLength; i += this._interval) {
                        if (intervalFunction && !intervalFunction(i, data[i]) && i < dataLength) {
                            continue;
                        }
                        curX = i < dataLength ? this.getCoordByIndex(i) + optGap : this.grid.getXend();
                        axShape = {
                            zlevel: this.getZlevelBase(),
                            z: this.getZBase(),
                            hoverable: false,
                            style: {
                                x: lastX,
                                y: y,
                                width: curX - lastX,
                                height: height,
                                color: color[i / this._interval % colorLength]
                            }
                        };
                        this.shapeList.push(new RectangleShape(axShape));
                        lastX = curX;
                    }
                } else {
                    var x = this.grid.getX();
                    var width = this.grid.getWidth();
                    var lastYend = this.grid.getYend();
                    var curY;
                    for (var i = 0; i <= dataLength; i += this._interval) {
                        if (intervalFunction && !intervalFunction(i, data[i]) && i < dataLength) {
                            continue;
                        }
                        curY = i < dataLength ? this.getCoordByIndex(i) - optGap : this.grid.getY();
                        axShape = {
                            zlevel: this.getZlevelBase(),
                            z: this.getZBase(),
                            hoverable: false,
                            style: {
                                x: x,
                                y: curY,
                                width: width,
                                height: lastYend - curY,
                                color: color[i / this._interval % colorLength]
                            }
                        };
                        this.shapeList.push(new RectangleShape(axShape));
                        lastYend = curY;
                    }
                }
            }
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = this.reformOption(newOption);
                this.option.axisLabel.textStyle = this.getTextStyle(this.option.axisLabel.textStyle);
            }
            this.clear();
            this._buildShape();
        },
        getGap: function () {
            var dataLength = this.option.data.length;
            var total = this.isHorizontal() ? this.grid.getWidth() : this.grid.getHeight();
            if (this.option.boundaryGap) {
                return total / dataLength;
            } else {
                return total / (dataLength > 1 ? dataLength - 1 : 1);
            }
        },
        getCoord: function (value) {
            var data = this.option.data;
            var dataLength = data.length;
            var gap = this.getGap();
            var position = this.option.boundaryGap ? gap / 2 : 0;
            for (var i = 0; i < dataLength; i++) {
                if (this.getDataFromOption(data[i]) == value) {
                    if (this.isHorizontal()) {
                        position = this.grid.getX() + position;
                    } else {
                        position = this.grid.getYend() - position;
                    }
                    return position;
                }
                position += gap;
            }
        },
        getCoordByIndex: function (dataIndex) {
            if (dataIndex < 0) {
                if (this.isHorizontal()) {
                    return this.grid.getX();
                } else {
                    return this.grid.getYend();
                }
            } else if (dataIndex > this.option.data.length - 1) {
                if (this.isHorizontal()) {
                    return this.grid.getXend();
                } else {
                    return this.grid.getY();
                }
            } else {
                var gap = this.getGap();
                var position = this.option.boundaryGap ? gap / 2 : 0;
                position += dataIndex * gap;
                if (this.isHorizontal()) {
                    position = this.grid.getX() + position;
                } else {
                    position = this.grid.getYend() - position;
                }
                return position;
            }
        },
        getNameByIndex: function (dataIndex) {
            return this.getDataFromOption(this.option.data[dataIndex]);
        },
        getIndexByName: function (name) {
            var data = this.option.data;
            var dataLength = data.length;
            for (var i = 0; i < dataLength; i++) {
                if (this.getDataFromOption(data[i]) == name) {
                    return i;
                }
            }
            return -1;
        },
        getValueFromCoord: function () {
            return '';
        },
        isMainAxis: function (dataIndex) {
            return dataIndex % this._interval === 0;
        }
    };
    zrUtil.inherits(CategoryAxis, Base);
    require('../component').define('categoryAxis', CategoryAxis);
    return CategoryAxis;
});define('echarts/component/valueAxis', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Line',
    'zrender/shape/Rectangle',
    '../config',
    '../util/date',
    'zrender/tool/util',
    '../util/smartSteps',
    '../util/accMath',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var LineShape = require('zrender/shape/Line');
    var RectangleShape = require('zrender/shape/Rectangle');
    var ecConfig = require('../config');
    ecConfig.valueAxis = {
        zlevel: 0,
        z: 0,
        show: true,
        position: 'left',
        name: '',
        nameLocation: 'end',
        nameTextStyle: {},
        boundaryGap: [
            0,
            0
        ],
        axisLine: {
            show: false,
            onZero: true,
            lineStyle: {
                color: '#48b',
                width: 2,
                type: 'solid'
            }
        },
        axisTick: {
            show: false,
            inside: false,
            length: 5,
            lineStyle: {
                color: '#333',
                width: 1
            }
        },
        axisLabel: {
            show: true,
            rotate: 0,
            margin: -1,
            textStyle: {
                align: 'left',
                baseline: 'bottom',
                color: '#333'
            }
        },
        splitLine: {
            show: true,
            lineStyle: {
                color: ['#ccc'],
                width: 1,
                type: 'solid'
            }
        },
        splitArea: {
            show: false,
            areaStyle: {
                color: [
                    'rgba(250,250,250,0.3)',
                    'rgba(200,200,200,0.3)'
                ]
            }
        }
    };
    var ecDate = require('../util/date');
    var zrUtil = require('zrender/tool/util');
    function ValueAxis(ecTheme, messageCenter, zr, option, myChart, axisBase, series) {
        if (!series || series.length === 0) {
            console.err('option.series.length == 0.');
            return;
        }
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.series = series;
        this.grid = this.component.grid;
        for (var method in axisBase) {
            this[method] = axisBase[method];
        }
        this.refresh(option, series);
    }
    ValueAxis.prototype = {
        type: ecConfig.COMPONENT_TYPE_AXIS_VALUE,
        _buildShape: function () {
            this._hasData = false;
            this._calculateValue();
            if (!this._hasData || !this.option.show) {
                return;
            }
            this.option.splitArea.show && this._buildSplitArea();
            this.option.splitLine.show && this._buildSplitLine();
            this.option.axisLine.show && this._buildAxisLine();
            this.option.axisTick.show && this._buildAxisTick();
            this.option.axisLabel.show && this._buildAxisLabel();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildAxisTick: function () {
            var axShape;
            var data = this._valueList;
            var dataLength = this._valueList.length;
            var tickOption = this.option.axisTick;
            var length = tickOption.length;
            var color = tickOption.lineStyle.color;
            var lineWidth = tickOption.lineStyle.width;
            if (this.isHorizontal()) {
                var yPosition = this.option.position === 'bottom' ? tickOption.inside ? this.grid.getYend() - length - 1 : this.grid.getYend() + 1 : tickOption.inside ? this.grid.getY() + 1 : this.grid.getY() - length - 1;
                var x;
                for (var i = 0; i < dataLength; i++) {
                    x = this.subPixelOptimize(this.getCoord(data[i]), lineWidth);
                    axShape = {
                        _axisShape: 'axisTick',
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: x,
                            yStart: yPosition,
                            xEnd: x,
                            yEnd: yPosition + length,
                            strokeColor: color,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            } else {
                var xPosition = this.option.position === 'left' ? tickOption.inside ? this.grid.getX() + 1 : this.grid.getX() - length - 1 : tickOption.inside ? this.grid.getXend() - length - 1 : this.grid.getXend() + 1;
                var y;
                for (var i = 0; i < dataLength; i++) {
                    y = this.subPixelOptimize(this.getCoord(data[i]), lineWidth);
                    axShape = {
                        _axisShape: 'axisTick',
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: xPosition,
                            yStart: y,
                            xEnd: xPosition + length,
                            yEnd: y,
                            strokeColor: color,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            }
        },
        _buildAxisLabel: function () {
            var axShape;
            var data = this._valueList;
            var dataLength = this._valueList.length;
            var rotate = this.option.axisLabel.rotate;
            var margin = this.option.axisLabel.margin;
            var clickable = this.option.axisLabel.clickable;
            var textStyle = this.option.axisLabel.textStyle;
            if (this.isHorizontal()) {
                var yPosition;
                var baseLine;
                if (this.option.position === 'bottom') {
                    yPosition = this.grid.getYend() + margin;
                    baseLine = 'top';
                } else {
                    yPosition = this.grid.getY() - margin;
                    baseLine = 'bottom';
                }
                for (var i = 0; i < dataLength; i++) {
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase() + 3,
                        hoverable: false,
                        style: {
                            x: this.getCoord(data[i]),
                            y: yPosition,
                            color: typeof textStyle.color === 'function' ? textStyle.color(data[i]) : textStyle.color,
                            text: this._valueLabel[i],
                            textFont: this.getFont(textStyle),
                            textAlign: textStyle.align || 'center',
                            textBaseline: textStyle.baseline || baseLine
                        }
                    };
                    if (rotate) {
                        axShape.style.textAlign = rotate > 0 ? this.option.position === 'bottom' ? 'right' : 'left' : this.option.position === 'bottom' ? 'left' : 'right';
                        axShape.rotation = [
                            rotate * Math.PI / 180,
                            axShape.style.x,
                            axShape.style.y
                        ];
                    }
                    this.shapeList.push(new TextShape(this._axisLabelClickable(clickable, axShape)));
                }
            } else {
                var xPosition;
                var align;
                if (this.option.position === 'left') {
                    xPosition = this.grid.getX() - margin;
                    align = 'right';
                } else {
                    xPosition = this.grid.getXend() + margin;
                    align = 'left';
                }
                for (var i = 0; i < dataLength; i++) {
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase() + 3,
                        hoverable: false,
                        style: {
                            x: xPosition,
                            y: this.getCoord(data[i]),
                            color: typeof textStyle.color === 'function' ? textStyle.color(data[i]) : textStyle.color,
                            text: this._valueLabel[i],
                            textFont: this.getFont(textStyle),
                            textAlign: textStyle.align || align,
                            textBaseline: textStyle.baseline || (i === 0 && this.option.name !== '' ? 'bottom' : i === dataLength - 1 && this.option.name !== '' ? 'top' : 'middle')
                        }
                    };
                    if (rotate) {
                        axShape.rotation = [
                            rotate * Math.PI / 180,
                            axShape.style.x,
                            axShape.style.y
                        ];
                    }
                    this.shapeList.push(new TextShape(this._axisLabelClickable(clickable, axShape)));
                }
            }
        },
        _buildSplitLine: function () {
            var axShape;
            var data = this._valueList;
            var dataLength = this._valueList.length;
            var sLineOption = this.option.splitLine;
            var lineType = sLineOption.lineStyle.type;
            var lineWidth = sLineOption.lineStyle.width;
            var color = sLineOption.lineStyle.color;
            color = color instanceof Array ? color : [color];
            var colorLength = color.length;
            if (this.isHorizontal()) {
                var sy = this.grid.getY();
                var ey = this.grid.getYend();
                var x;
                for (var i = 0; i < dataLength; i++) {
                    x = this.subPixelOptimize(this.getCoord(data[i]), lineWidth);
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: x,
                            yStart: sy,
                            xEnd: x,
                            yEnd: ey,
                            strokeColor: color[i % colorLength],
                            lineType: lineType,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            } else {
                var sx = this.grid.getX();
                var ex = this.grid.getXend();
                var y;
                for (var i = 0; i < dataLength; i++) {
                    y = this.subPixelOptimize(this.getCoord(data[i]), lineWidth);
                    axShape = {
                        zlevel: this.getZlevelBase(),
                        z: this.getZBase(),
                        hoverable: false,
                        style: {
                            xStart: sx,
                            yStart: y,
                            xEnd: ex,
                            yEnd: y,
                            strokeColor: color[i % colorLength],
                            lineType: lineType,
                            lineWidth: lineWidth
                        }
                    };
                    this.shapeList.push(new LineShape(axShape));
                }
            }
        },
        _buildSplitArea: function () {
            var axShape;
            var color = this.option.splitArea.areaStyle.color;
            if (!(color instanceof Array)) {
                axShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: this.grid.getX(),
                        y: this.grid.getY(),
                        width: this.grid.getWidth(),
                        height: this.grid.getHeight(),
                        color: color
                    }
                };
                this.shapeList.push(new RectangleShape(axShape));
            } else {
                var colorLength = color.length;
                var data = this._valueList;
                var dataLength = this._valueList.length;
                if (this.isHorizontal()) {
                    var y = this.grid.getY();
                    var height = this.grid.getHeight();
                    var lastX = this.grid.getX();
                    var curX;
                    for (var i = 0; i <= dataLength; i++) {
                        curX = i < dataLength ? this.getCoord(data[i]) : this.grid.getXend();
                        axShape = {
                            zlevel: this.getZlevelBase(),
                            z: this.getZBase(),
                            hoverable: false,
                            style: {
                                x: lastX,
                                y: y,
                                width: curX - lastX,
                                height: height,
                                color: color[i % colorLength]
                            }
                        };
                        this.shapeList.push(new RectangleShape(axShape));
                        lastX = curX;
                    }
                } else {
                    var x = this.grid.getX();
                    var width = this.grid.getWidth();
                    var lastYend = this.grid.getYend();
                    var curY;
                    for (var i = 0; i <= dataLength; i++) {
                        curY = i < dataLength ? this.getCoord(data[i]) : this.grid.getY();
                        axShape = {
                            zlevel: this.getZlevelBase(),
                            z: this.getZBase(),
                            hoverable: false,
                            style: {
                                x: x,
                                y: curY,
                                width: width,
                                height: lastYend - curY,
                                color: color[i % colorLength]
                            }
                        };
                        this.shapeList.push(new RectangleShape(axShape));
                        lastYend = curY;
                    }
                }
            }
        },
        _calculateValue: function () {
            if (isNaN(this.option.min - 0) || isNaN(this.option.max - 0)) {
                var data = {};
                var xIdx;
                var yIdx;
                var legend = this.component.legend;
                for (var i = 0, l = this.series.length; i < l; i++) {
                    if (this.series[i].type != ecConfig.CHART_TYPE_LINE && this.series[i].type != ecConfig.CHART_TYPE_BAR && this.series[i].type != ecConfig.CHART_TYPE_SCATTER && this.series[i].type != ecConfig.CHART_TYPE_K && this.series[i].type != ecConfig.CHART_TYPE_EVENTRIVER) {
                        continue;
                    }
                    if (legend && !legend.isSelected(this.series[i].name)) {
                        continue;
                    }
                    xIdx = this.series[i].xAxisIndex || 0;
                    yIdx = this.series[i].yAxisIndex || 0;
                    if (this.option.xAxisIndex != xIdx && this.option.yAxisIndex != yIdx) {
                        continue;
                    }
                    this._calculSum(data, i);
                }
                var oriData;
                for (var i in data) {
                    oriData = data[i];
                    for (var j = 0, k = oriData.length; j < k; j++) {
                        if (!isNaN(oriData[j])) {
                            this._hasData = true;
                            this._min = oriData[j];
                            this._max = oriData[j];
                            break;
                        }
                    }
                    if (this._hasData) {
                        break;
                    }
                }
                for (var i in data) {
                    oriData = data[i];
                    for (var j = 0, k = oriData.length; j < k; j++) {
                        if (!isNaN(oriData[j])) {
                            this._min = Math.min(this._min, oriData[j]);
                            this._max = Math.max(this._max, oriData[j]);
                        }
                    }
                }
                var gap = Math.abs(this._max - this._min);
                this._min = isNaN(this.option.min - 0) ? this._min - Math.abs(gap * this.option.boundaryGap[0]) : this.option.min - 0;
                this._max = isNaN(this.option.max - 0) ? this._max + Math.abs(gap * this.option.boundaryGap[1]) : this.option.max - 0;
                if (this._min === this._max) {
                    if (this._max === 0) {
                        this._max = 1;
                    } else if (this._max > 0) {
                        this._min = this._max / this.option.splitNumber != null ? this.option.splitNumber : 5;
                    } else {
                        this._max = this._max / this.option.splitNumber != null ? this.option.splitNumber : 5;
                    }
                }
                this.option.type != 'time' ? this._reformValue(this.option.scale) : this._reformTimeValue();
            } else {
                this._hasData = true;
                this._min = this.option.min - 0;
                this._max = this.option.max - 0;
                this.option.type != 'time' ? this._customerValue() : this._reformTimeValue();
            }
        },
        _calculSum: function (data, i) {
            var key = this.series[i].name || 'kener';
            var value;
            var oriData;
            if (!this.series[i].stack) {
                data[key] = data[key] || [];
                if (this.series[i].type != ecConfig.CHART_TYPE_EVENTRIVER) {
                    oriData = this.series[i].data;
                    for (var j = 0, k = oriData.length; j < k; j++) {
                        value = this.getDataFromOption(oriData[j]);
                        if (this.series[i].type === ecConfig.CHART_TYPE_K) {
                            data[key].push(value[0]);
                            data[key].push(value[1]);
                            data[key].push(value[2]);
                            data[key].push(value[3]);
                        } else if (value instanceof Array) {
                            if (this.option.xAxisIndex != -1) {
                                data[key].push(this.option.type != 'time' ? value[0] : ecDate.getNewDate(value[0]));
                            }
                            if (this.option.yAxisIndex != -1) {
                                data[key].push(this.option.type != 'time' ? value[1] : ecDate.getNewDate(value[1]));
                            }
                        } else {
                            data[key].push(value);
                        }
                    }
                } else {
                    oriData = this.series[i].eventList;
                    for (var j = 0, k = oriData.length; j < k; j++) {
                        var evolution = oriData[j].evolution;
                        for (var m = 0, n = evolution.length; m < n; m++) {
                            data[key].push(ecDate.getNewDate(evolution[m].time));
                        }
                    }
                }
            } else {
                var keyP = '__Magic_Key_Positive__' + this.series[i].stack;
                var keyN = '__Magic_Key_Negative__' + this.series[i].stack;
                data[keyP] = data[keyP] || [];
                data[keyN] = data[keyN] || [];
                data[key] = data[key] || [];
                oriData = this.series[i].data;
                for (var j = 0, k = oriData.length; j < k; j++) {
                    value = this.getDataFromOption(oriData[j]);
                    if (value === '-') {
                        continue;
                    }
                    value = value - 0;
                    if (value >= 0) {
                        if (data[keyP][j] != null) {
                            data[keyP][j] += value;
                        } else {
                            data[keyP][j] = value;
                        }
                    } else {
                        if (data[keyN][j] != null) {
                            data[keyN][j] += value;
                        } else {
                            data[keyN][j] = value;
                        }
                    }
                    if (this.option.scale) {
                        data[key].push(value);
                    }
                }
            }
        },
        _reformValue: function (scale) {
            var smartSteps = require('../util/smartSteps');
            var splitNumber = this.option.splitNumber;
            if (!scale && this._min >= 0 && this._max >= 0) {
                this._min = 0;
            }
            if (!scale && this._min <= 0 && this._max <= 0) {
                this._max = 0;
            }
            var stepOpt = smartSteps(this._min, this._max, splitNumber);
            splitNumber = splitNumber != null ? splitNumber : stepOpt.secs;
            this._min = stepOpt.min;
            this._max = stepOpt.max;
            this._valueList = stepOpt.pnts;
            this._reformLabelData();
        },
        _reformTimeValue: function () {
            var splitNumber = this.option.splitNumber != null ? this.option.splitNumber : 5;
            var curValue = ecDate.getAutoFormatter(this._min, this._max, splitNumber);
            var formatter = curValue.formatter;
            var gapValue = curValue.gapValue;
            this._valueList = [ecDate.getNewDate(this._min)];
            var startGap;
            switch (formatter) {
            case 'week':
                startGap = ecDate.nextMonday(this._min);
                break;
            case 'month':
                startGap = ecDate.nextNthOnMonth(this._min, 1);
                break;
            case 'quarter':
                startGap = ecDate.nextNthOnQuarterYear(this._min, 1);
                break;
            case 'half-year':
                startGap = ecDate.nextNthOnHalfYear(this._min, 1);
                break;
            case 'year':
                startGap = ecDate.nextNthOnYear(this._min, 1);
                break;
            default:
                if (gapValue <= 3600000 * 2) {
                    startGap = (Math.floor(this._min / gapValue) + 1) * gapValue;
                } else {
                    startGap = ecDate.getNewDate(this._min - -gapValue);
                    startGap.setHours(Math.round(startGap.getHours() / 6) * 6);
                    startGap.setMinutes(0);
                    startGap.setSeconds(0);
                }
                break;
            }
            if (startGap - this._min < gapValue / 2) {
                startGap -= -gapValue;
            }
            curValue = ecDate.getNewDate(startGap);
            splitNumber *= 1.5;
            while (splitNumber-- >= 0) {
                if (formatter == 'month' || formatter == 'quarter' || formatter == 'half-year' || formatter == 'year') {
                    curValue.setDate(1);
                }
                if (this._max - curValue < gapValue / 2) {
                    break;
                }
                this._valueList.push(curValue);
                curValue = ecDate.getNewDate(curValue - -gapValue);
            }
            this._valueList.push(ecDate.getNewDate(this._max));
            this._reformLabelData(formatter);
        },
        _customerValue: function () {
            var accMath = require('../util/accMath');
            var splitNumber = this.option.splitNumber != null ? this.option.splitNumber : 5;
            var splitGap = (this._max - this._min) / splitNumber;
            this._valueList = [];
            for (var i = 0; i <= splitNumber; i++) {
                this._valueList.push(accMath.accAdd(this._min, accMath.accMul(splitGap, i)));
            }
            this._reformLabelData();
        },
        _reformLabelData: function (timeFormatter) {
            this._valueLabel = [];
            var formatter = this.option.axisLabel.formatter;
            if (formatter) {
                for (var i = 0, l = this._valueList.length; i < l; i++) {
                    if (typeof formatter === 'function') {
                        this._valueLabel.push(timeFormatter ? formatter.call(this.myChart, this._valueList[i], timeFormatter) : formatter.call(this.myChart, this._valueList[i]));
                    } else if (typeof formatter === 'string') {
                        this._valueLabel.push(timeFormatter ? ecDate.format(formatter, this._valueList[i]) : formatter.replace('{value}', this._valueList[i]));
                    }
                }
            } else if (timeFormatter) {
                for (var i = 0, l = this._valueList.length; i < l; i++) {
                    this._valueLabel.push(ecDate.format(timeFormatter, this._valueList[i]));
                }
            } else {
                for (var i = 0, l = this._valueList.length; i < l; i++) {
                    this._valueLabel.push(this.numAddCommas(this._valueList[i]));
                }
            }
        },
        getExtremum: function () {
            this._calculateValue();
            return {
                min: this._min,
                max: this._max
            };
        },
        refresh: function (newOption, newSeries) {
            if (newOption) {
                this.option = this.reformOption(newOption);
                this.option.axisLabel.textStyle = zrUtil.merge(this.option.axisLabel.textStyle || {}, this.ecTheme.textStyle);
                this.series = newSeries;
            }
            if (this.zr) {
                this.clear();
                this._buildShape();
            }
        },
        getCoord: function (value) {
            value = value < this._min ? this._min : value;
            value = value > this._max ? this._max : value;
            var result;
            if (!this.isHorizontal()) {
                result = this.grid.getYend() - (value - this._min) / (this._max - this._min) * this.grid.getHeight();
            } else {
                result = this.grid.getX() + (value - this._min) / (this._max - this._min) * this.grid.getWidth();
            }
            return result;
        },
        getCoordSize: function (value) {
            if (!this.isHorizontal()) {
                return Math.abs(value / (this._max - this._min) * this.grid.getHeight());
            } else {
                return Math.abs(value / (this._max - this._min) * this.grid.getWidth());
            }
        },
        getValueFromCoord: function (coord) {
            var result;
            if (!this.isHorizontal()) {
                coord = coord < this.grid.getY() ? this.grid.getY() : coord;
                coord = coord > this.grid.getYend() ? this.grid.getYend() : coord;
                result = this._max - (coord - this.grid.getY()) / this.grid.getHeight() * (this._max - this._min);
            } else {
                coord = coord < this.grid.getX() ? this.grid.getX() : coord;
                coord = coord > this.grid.getXend() ? this.grid.getXend() : coord;
                result = this._min + (coord - this.grid.getX()) / this.grid.getWidth() * (this._max - this._min);
            }
            return result.toFixed(2) - 0;
        },
        isMaindAxis: function (value) {
            for (var i = 0, l = this._valueList.length; i < l; i++) {
                if (this._valueList[i] === value) {
                    return true;
                }
            }
            return false;
        }
    };
    zrUtil.inherits(ValueAxis, Base);
    require('../component').define('valueAxis', ValueAxis);
    return ValueAxis;
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