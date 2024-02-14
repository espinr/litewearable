import brightness from '@system.brightness';
import sensor from '@system.sensor';
import file from '@system.file';

import app from '@system.app';

// URI of the file that will store the values
// So far, the information is only stored (not read or shared)
const FILE_STORE = 'internal://app/heartrate.txt';
const CONSOLIDATE_BUFFER_SECONDS = 10;

export default {
    data: {
        intervalWriteID: null,  // Internal reference for the async interval
        message: '',            // Reactive text for the main screen
        onBody: false,          // Whether the user wears the device or not
        hr: '-',                // Indicator with the current HR value when reading
        readingHR: false,        // Flag to indicate if it is reading or not
        heartFrames: [          // Simple heart animation
            { src: "/common/heart_white_01.png" },
            { src: "/common/heart_white_02.png" },
            { src: "/common/heart_white_03.png" },
            { src: "/common/heart_white_04.png" },
            { src: "/common/heart_white_05.png" }
        ],
        // Config of the chart data that represents the HR
        lineData: [
            {
                strokeColor: '#ED146F',
                fillColor: '#ffffff',
                gradient: true,
                data: [60],     // Includes this by default, to show one initial value
            }
        ],
        // Configuration of the chart itself
        lineOps: {
            xAxis: {
                min: 0,
                max: 20,
                display: false,
            },
            yAxis: {
                min: 40,
                max: 200,
                display: false,
            },
            series: {
                lineStyle: {
                    width: "5px",
                    smooth: true,
                },
                headPoint: {
                    shape: "circle",
                    size: 10,
                    strokeWidth: 5,
                    fillColor: '#ffffff',
                    strokeColor: '#ED146F',
                    display: true,
                },
                loop: {
                    margin: 2,
                }
            }
        },
        buffer: ''   // Auxiliary buffer for intermediate HR values during subscription
    },
    onInit() {
        this.message = this.$t('strings.press_button');
        // First, checks if the user is wearing the device
        this.checkOnBodySensor();
        // Keeps the screen on while measuring
        brightness.setKeepScreenOn({
            keepScreenOn: true,
            success: function () {
                console.info('Screen On success');
            },
            fail: function () {
                console.error('[onInit()] Screen On failed');
            },
        });
        // Handling local files to store the values (just testing, no other purpose)
        // Uncomment the following lines to test it
        //this.getListStoredFiles();      // Just to list the app file system directory
        //this.readStoredFile();          // Reads the stored file in the app
        //this.deleteStoredFile();        // Remove the file if existed
    },
    onDestroy() {
        sensor.unsubscribeOnBodyState();
    },
    // If user swiped right, terminates the app
    closeApp(event) {
        if (event.direction === 'right') {
            this.stopReading();
            app.terminate();
        }
    },
    checkOnBodySensor() {
        // If the user does not wear the device the button is disabled
        const _this = this;
        sensor.subscribeOnBodyState({
            success: function (ret) {
                console.info(`Get On-body state = ${ret.value}`);
                if (ret.value === false) {
                    _this.onBody = false;
                    _this.message = _this.$t('strings.try_again');
                    if (_this.readingHR) {
                        // Stops reading if user removes the wearable
                        _this.stopReading();
                    }
                } else {
                    _this.onBody = true;
                }
            },
            fail: function (data, code) {
                console.error(`[checkOnBodySensor()] Cannot get on-body state, code = ${code}, data = ${data}`);
                _this.onBody = false;
            },
        });
    },
    subscribeHR() {
        const _this = this;
        sensor.subscribeHeartRate({
            success: function(ret) {
                // Every time a change is detected, updates the buffer and chart
                _this.hr = ret.heartRate;
                console.debug(`Got HR value: ${ret.heartRate}`);
                _this.addChartData(ret.heartRate);
                _this.buffer += `${Date.now()},${Number(ret.heartRate)}\n`;
            },
            fail: function(data, code) {
                console.error(`[subscribeHR()] Subscription failed. Code = ${code}, Data = ${data}`);
            },
        });
    },
    addChartData(data) {
        // Appends 'data' integer to the chart data
        if (this.$refs) {
            this.$refs.linechart.append({
                serial: 0,
                data: [Number(data)]
            });
        }
    },
    unsubscribeHR() {
        sensor.unsubscribeHeartRate();
    },
    startReading() {
        if (this.onBody) {
            this.message = this.$t("strings.reading");
            this.readingHR = true;
            this.subscribeHR();
            // From time to time writes the buffer content in the file
            this.scheduleBufferWrite();
        } else {
            this.message = this.$t("strings.try_again");
        }
    },
    stopReading() {
        this.message = this.$t('strings.press_again');
        this.readingHR= false;
        this.unsubscribeHR();
        this.stopScheduleBufferWrite();
    },
    scheduleBufferWrite() {
        // Every 60 seconds the app will store and clear the buffer
        this.intervalWriteID = setInterval(function() {
            this.appendBufferToFile();
        }.bind(this), CONSOLIDATE_BUFFER_SECONDS * 1000);
    },
    stopScheduleBufferWrite() {
        // Every 15 seconds the app will store and clear the buffer
        clearInterval(this.intervalWriteID);
    },
    getListStoredFiles() {
        file.list({
            uri: 'internal://app/',
            success: function(data) {
                for (let index = 0; index < data.fileList.length; index++) {
                    const element = data.fileList[index];
                    console.debug(`File ${element.uri} (${element.length} bytes)`);
                }
            },
            fail: function(data, code) {
                console.error(`[getListStoredFiles()] - Callback fail. Code = ${code} data = ${data}`);
            },
        });
    },
    readStoredFile() {
        file.get({
            uri: FILE_STORE,
            success: function(data) {
                file.readText({
                    uri: FILE_STORE,
                    success: function (text) {
                        console.debug(`Found File ${data.uri} (${data.length} bytes)`);
                        console.debug(`Content retrieved:\n${text.text}`);
                    },
                    fail: function (data, code) {
                        console.error(`[readStoredFile() - file.readText] - Callback fail. Code = ${code} data = ${data}`);
                    },
                });
            },
            fail: function(data, code) {
                console.debug(`[readStoredFile()] - Fail. Code = ${code} data = ${data}`);
            },
        });
    },
    deleteStoredFile() {
        file.delete({
            uri: FILE_STORE,
            success: function(data) {
                console.debug(`File ${FILE_STORE} deleted successfully`);
            },
            fail: function(data, code) {
                console.debug(`[deleteStoredFile()] - Fail. Code = ${code} data = ${data}`);
            },
        });
    },
    appendBufferToFile() {
        const _this = this;
        if (this.buffer === '') return;
        file.writeText({
            uri: FILE_STORE,
            append: true,
            text: _this.buffer,
            success: function() {
                console.debug('Buffer stored in the file successfully:');
                console.debug(_this.buffer);
                console.debug('--');
                // Cleans the buffer
                _this.buffer = '';
            },
            fail: function(data, code) {
                console.error(`[appendBufferToFile()] Callback fail, code = ${code},  data = ${data}`);
            },
        });
    }
}
