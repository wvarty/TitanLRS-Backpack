#pragma once

#include <Arduino.h>
#include <vector>
#include <functional>

//=========================================================
// CRSF Parameters Protocol Handler
// 
// This class handles sending and receiving CRSF protocol
// frames for device discovery and parameter management.
//
// See CRSF_PARAMETERS_IMPLEMENTATION.md for protocol details.
//=========================================================

// CRSF Frame Types for Parameters
#define CRSF_FRAMETYPE_DEVICE_PING   0x28
#define CRSF_FRAMETYPE_DEVICE_INFO   0x29
#define CRSF_FRAMETYPE_PARAM_ENTRY   0x2B
#define CRSF_FRAMETYPE_PARAM_READ    0x2C
#define CRSF_FRAMETYPE_PARAM_WRITE   0x2D

// CRSF Addresses
#define CRSF_ADDRESS_BROADCAST          0x00
#define CRSF_ADDRESS_RADIO_TRANSMITTER  0xEA  // EdgeTX/OpenTX radio

// Parameter Types
enum CRSFParamType {
    CRSF_PARAM_TYPE_UINT8          = 0x00,
    CRSF_PARAM_TYPE_INT8           = 0x01,
    CRSF_PARAM_TYPE_UINT16         = 0x02,
    CRSF_PARAM_TYPE_INT16          = 0x03,
    CRSF_PARAM_TYPE_UINT32         = 0x04,
    CRSF_PARAM_TYPE_INT32          = 0x05,
    CRSF_PARAM_TYPE_FLOAT          = 0x08,
    CRSF_PARAM_TYPE_TEXT_SELECTION = 0x09,
    CRSF_PARAM_TYPE_STRING         = 0x0A,
    CRSF_PARAM_TYPE_FOLDER         = 0x0B,
    CRSF_PARAM_TYPE_INFO           = 0x0C,
    CRSF_PARAM_TYPE_COMMAND        = 0x0D,
};

#define CRSF_PARAM_HIDDEN            0x80

// Maximum frame payload size
#define CRSF_MAX_PAYLOAD_SIZE        60
#define CRSF_MAX_FRAME_SIZE          64

// Timeouts (in ms)
#define CRSF_SCAN_TIMEOUT_MS         2000
#define CRSF_PARAM_READ_TIMEOUT_MS   2000
#define CRSF_PARAM_WRITE_TIMEOUT_MS  1000

// Device info structure
struct CRSFDeviceInfo {
    char name[32];
    uint8_t address;
    uint32_t serialNumber;
    uint32_t hardwareId;
    uint32_t firmwareId;
    uint8_t parametersTotal;
    uint8_t parameterVersion;
    bool online;
};

// Parameter info structure (base fields)
struct CRSFParamInfo {
    uint8_t paramNumber;
    uint8_t parentFolder;
    uint8_t type;
    bool isHidden;
    char name[64];
    
    // Numeric types (UINT8, INT8, UINT16, INT16, UINT32, INT32)
    int32_t numValue;
    int32_t numMin;
    int32_t numMax;
    int32_t numDefault;
    char unit[16];
    
    // TEXT_SELECTION specific
    char options[256];  // semicolon-separated
    uint8_t selectValue;
    uint8_t selectMin;
    uint8_t selectMax;
    uint8_t selectDefault;
    
    // STRING specific
    char stringValue[128];
    uint8_t stringMaxLength;
    
    // FLOAT specific
    float floatValue;
    float floatMin;
    float floatMax;
    float floatDefault;
    uint8_t decimalPoint;
    float stepSize;
    
    // COMMAND specific
    uint8_t cmdStatus;
    uint8_t cmdTimeout;
    char cmdInfo[64];
    
    // INFO specific
    char infoValue[128];
};

// Request state machine states
enum CRSFRequestState {
    CRSF_STATE_IDLE = 0,
    CRSF_STATE_SCANNING,
    CRSF_STATE_READING_PARAMS,
    CRSF_STATE_WRITING_PARAM,
};

// Callback types
typedef std::function<void(const CRSFDeviceInfo&)> DeviceInfoCallback;
typedef std::function<void(const CRSFParamInfo&)> ParamInfoCallback;
typedef std::function<void(bool success)> CompletionCallback;

class CRSFParams {
public:
    CRSFParams();
    
    // Initialize with serial stream
    void begin(Stream* serial);
    
    // Must be called from loop() to process incoming data and timeouts
    void loop();
    
    // Process a single received byte (call this for each byte from Serial)
    void processReceivedByte(uint8_t byte);
    
    // Start device scan (broadcasts DEVICE_PING, collects responses)
    void startScan(DeviceInfoCallback onDevice, CompletionCallback onComplete);
    
    // Cancel ongoing scan
    void cancelScan();

    // Cancel ongoing parameter load
    void cancelParameterLoad();

    // Start loading all parameters for a device
    void loadParameters(uint8_t deviceAddress, uint8_t paramCount,
                       ParamInfoCallback onParam, CompletionCallback onComplete);
    
    // Write a parameter value
    void writeParameter(uint8_t deviceAddress, uint8_t paramNumber, 
                       const uint8_t* value, uint8_t valueLen,
                       CompletionCallback onComplete);
    
    // Get last error message
    const char* getLastError() const { return _lastError; }
    
private:
    Stream* _serial;
    CRSFRequestState _state;
    unsigned long _requestStartTime;
    unsigned long _lastActivityTime;
    char _lastError[64];
    
    // Receive buffer
    uint8_t _rxBuffer[CRSF_MAX_FRAME_SIZE];
    uint8_t _rxIndex;
    
    // Scan state
    DeviceInfoCallback _onDeviceInfo;
    CompletionCallback _onScanComplete;
    std::vector<CRSFDeviceInfo> _discoveredDevices;
    
    // Parameter read state
    uint8_t _targetDevice;
    uint8_t _targetParamCount;
    uint8_t _currentParam;
    uint8_t _currentChunk;
    uint8_t _paramChunks[256];  // Fixed-size buffer instead of vector
    uint16_t _paramChunksLen;
    uint8_t _lastChunkLen;      // Size of last chunk appended (for duplicate detection)
    ParamInfoCallback _onParamInfo;
    CompletionCallback _onParamComplete;
    
    // Parameter write state
    CompletionCallback _onWriteComplete;
    
    // Frame handling
    void sendFrame(uint8_t type, uint8_t destination, uint8_t origin, 
                  const uint8_t* payload, uint8_t payloadLen);
    void sendDevicePing();
    void sendParamRead(uint8_t deviceAddress, uint8_t paramNumber, uint8_t chunkNumber);
    void sendParamWrite(uint8_t deviceAddress, uint8_t paramNumber, 
                       const uint8_t* value, uint8_t valueLen);
    
    // Frame parsing
    bool assembleFrame(uint8_t byte);
    void processFrame();
    void handleDeviceInfo();
    void handleParamEntry();
    
    // Helpers
    uint8_t calculateCRC(const uint8_t* data, uint8_t len);
    void parseParamInfo(CRSFParamInfo& param, const uint8_t* data, uint16_t len);
    uint16_t parseNullTerminatedString(const uint8_t* data, uint16_t maxLen, char* output, uint16_t outputSize);
    uint32_t parseUint32BE(const uint8_t* data);
    int32_t parseInt32BE(const uint8_t* data);
    
    // State machine
    void checkTimeout();
    void completeRequest(bool success, const char* error = nullptr);
};

// Global instance
extern CRSFParams crsfParams;
